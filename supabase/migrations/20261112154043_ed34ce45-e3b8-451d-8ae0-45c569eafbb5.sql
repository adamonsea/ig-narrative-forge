-- What's-on pages: sources of events a feed owner pastes in
CREATE TABLE public.event_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  url text NOT NULL,
  name text NOT NULL,
  method text,
  is_active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  last_event_count integer,
  consecutive_empty_checks integer NOT NULL DEFAULT 0,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic_id, url)
);

GRANT SELECT ON public.event_sources TO authenticated;
GRANT ALL ON public.event_sources TO service_role;

ALTER TABLE public.event_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Feed owners can view their what's-on pages"
  ON public.event_sources FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.topics t WHERE t.id = event_sources.topic_id AND t.created_by = (select auth.uid()))
    OR public.has_role((select auth.uid()), 'admin')
  );

CREATE INDEX event_sources_topic_idx ON public.event_sources(topic_id);

-- Outbound clicks on event links (one per reader per event per day)
CREATE TABLE public.event_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  visitor_id text NOT NULL,
  click_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, visitor_id, click_date)
);

GRANT ALL ON public.event_clicks TO service_role;

ALTER TABLE public.event_clicks ENABLE ROW LEVEL SECURITY;

CREATE INDEX event_clicks_topic_date_idx ON public.event_clicks(topic_id, created_at);

CREATE OR REPLACE FUNCTION public.record_event_click(p_event_id uuid, p_visitor_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_topic uuid;
  v_owner uuid;
BEGIN
  IF p_event_id IS NULL OR p_visitor_id IS NULL
     OR length(p_visitor_id) < 8 OR length(p_visitor_id) > 128
     OR p_visitor_id !~ '^[A-Za-z0-9_-]+$' THEN
    RETURN;
  END IF;

  SELECT e.topic_id, t.created_by INTO v_topic, v_owner
  FROM events e JOIN topics t ON t.id = e.topic_id
  WHERE e.id = p_event_id AND e.status = 'published';

  IF v_topic IS NULL THEN RETURN; END IF;
  -- The feed's own owner clicking doesn't count as sending a reader
  IF (select auth.uid()) IS NOT NULL AND (select auth.uid()) = v_owner THEN RETURN; END IF;

  INSERT INTO event_clicks (topic_id, event_id, visitor_id)
  VALUES (v_topic, p_event_id, p_visitor_id)
  ON CONFLICT (event_id, visitor_id, click_date) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_event_click(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_event_click(uuid, text) TO anon, authenticated, service_role;

-- Only the feed's owner (or an admin) may delete an event from the card
CREATE OR REPLACE FUNCTION public.delete_event_with_backfill(event_id_param uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  topic_id_var UUID;
  deleted_rank INTEGER;
  replacement_event_id UUID;
BEGIN
  SELECT topic_id, rank_position INTO topic_id_var, deleted_rank
  FROM events WHERE id = event_id_param;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Event not found'::TEXT;
    RETURN;
  END IF;

  IF (select auth.uid()) IS NULL OR NOT (
    EXISTS (SELECT 1 FROM topics t WHERE t.id = topic_id_var AND t.created_by = (select auth.uid()))
    OR has_role((select auth.uid()), 'admin') OR has_role((select auth.uid()), 'superadmin')
  ) THEN
    RETURN QUERY SELECT false, 'Not allowed'::TEXT;
    RETURN;
  END IF;

  UPDATE events SET status = 'deleted' WHERE id = event_id_param;

  SELECT id INTO replacement_event_id
  FROM events
  WHERE topic_id = topic_id_var
    AND status = 'published'
    AND start_date >= CURRENT_DATE
    AND rank_position > 5
  ORDER BY rank_position ASC, start_date ASC
  LIMIT 1;

  IF replacement_event_id IS NOT NULL THEN
    UPDATE events SET rank_position = deleted_rank WHERE id = replacement_event_id;
    RETURN QUERY SELECT true, 'Event removed'::TEXT;
  ELSE
    RETURN QUERY SELECT true, 'Event removed'::TEXT;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_event_with_backfill(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_event_with_backfill(uuid) TO authenticated, service_role;

-- Readership: add "clicks sent to local venues this week"
CREATE OR REPLACE FUNCTION public.get_topic_readership(p_topic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_internal text[];
  v_week_start date := CURRENT_DATE - 6;
  v_prev_start date := CURRENT_DATE - 13;
  v_result jsonb;
  v_dropoff jsonb;
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN NULL; END IF;

  SELECT COALESCE(array_agg(DISTINCT visitor_id), ARRAY[]::text[]) INTO v_internal
    FROM site_visits WHERE topic_id = p_topic_id AND is_internal;

  WITH internal AS (
    SELECT DISTINCT regexp_replace(visitor_id, '^[a-z]+_', '') vid FROM site_visits
    WHERE topic_id = p_topic_id AND is_internal AND visitor_id IS NOT NULL
  ), sess AS (
    SELECT regexp_replace(si.visitor_id, '^[a-z]+_', '') vid, si.impression_date, MAX(si.position) depth
    FROM story_impressions si
    WHERE si.topic_id = p_topic_id AND NOT si.is_internal AND si.position IS NOT NULL
      AND si.impression_date >= v_week_start
      AND regexp_replace(si.visitor_id, '^[a-z]+_', '') NOT IN (SELECT vid FROM internal)
    GROUP BY 1, 2
  ), tot AS (SELECT COUNT(*) n, MAX(depth) deepest FROM sess)
  SELECT CASE WHEN tot.n >= 30 THEN jsonb_build_object(
      'sessions', tot.n,
      'reached', (SELECT jsonb_agg((SELECT COUNT(*) FROM sess WHERE sess.depth >= k) ORDER BY k)
                  FROM generate_series(0, LEAST(11, tot.deepest)) k))
    END INTO v_dropoff FROM tot;

  WITH reads AS (
    SELECT DISTINCT r.visitor_id, r.story_id, r.day FROM (
      SELECT si.visitor_id, si.story_id, si.created_at::date AS day FROM story_interactions si
        WHERE si.topic_id = p_topic_id AND si.interaction_type = 'swipe' AND si.story_id IS NOT NULL
          AND NOT si.is_internal AND si.created_at >= v_prev_start
      UNION ALL
      SELECT sv.visitor_id, (substring(sv.page_path from '/story/([0-9a-f-]{36})'))::uuid, sv.visit_date FROM site_visits sv
        WHERE sv.topic_id = p_topic_id AND sv.page_type = 'story' AND NOT sv.is_internal
          AND sv.page_path ~ '/story/[0-9a-f-]{36}' AND sv.visit_date >= v_prev_start
    ) r WHERE r.visitor_id IS NOT NULL AND NOT (r.visitor_id = ANY(v_internal))
  ), sc AS (
    SELECT * FROM story_stop_scores(p_topic_id, v_week_start)
  ), top AS (
    SELECT s.id, s.title, s.cover_illustration_url, x.n,
           q.seen, q.stop_rate, q.swipe_rate FROM (
      SELECT story_id, COUNT(*) n FROM reads WHERE day >= v_week_start GROUP BY story_id ORDER BY n DESC LIMIT 5
    ) x JOIN stories s ON s.id = x.story_id
    LEFT JOIN sc q ON q.story_id = x.story_id AND q.qualifies
  ), days AS (
    SELECT d::date AS day, (SELECT COUNT(*) FROM reads WHERE reads.day = d::date) n
    FROM generate_series(v_week_start, CURRENT_DATE, interval '1 day') d
  )
  SELECT jsonb_build_object(
    'reads_week', (SELECT COUNT(*) FROM reads WHERE day >= v_week_start),
    'reads_prev_week', (SELECT COUNT(*) FROM reads WHERE day < v_week_start),
    'readers_week', count_topic_visitors(p_topic_id, v_week_start),
    'daily', (SELECT jsonb_agg(jsonb_build_object('day', day, 'reads', n) ORDER BY day) FROM days),
    'top_stories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'reads', n, 'image', cover_illustration_url,
                      'seen', seen, 'stop_rate', stop_rate, 'swipe_rate', swipe_rate) ORDER BY n DESC) FROM top), '[]'::jsonb),
    'dropoff', v_dropoff,
    'top_stopper', (SELECT jsonb_build_object('id', s.id, 'title', s.title, 'image', s.cover_illustration_url,
                      'seen', x.seen, 'stop_rate', x.stop_rate, 'expected_rate', x.expected_rate, 'score', x.score)
                    FROM sc x JOIN stories s ON s.id = x.story_id
                    WHERE x.qualifies ORDER BY x.score DESC, x.seen DESC LIMIT 1),
    'event_clicks_week', (SELECT COUNT(*) FROM event_clicks ec
                          WHERE ec.topic_id = p_topic_id AND ec.click_date >= v_week_start
                            AND ec.visitor_id NOT LIKE 'zztest\_%'
                            AND NOT (ec.visitor_id = ANY(v_internal)))
  ) INTO v_result;

  RETURN v_result;
END;
$function$;