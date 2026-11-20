-- One reader definition for every dashboard number.
-- Read signal = swipe past slide 1, 3s+ headline stop, or 10s+ on a story page (topic_engagement).

-- 1) When a headline stop last changed, so "reading now" can see it.
ALTER TABLE public.story_impressions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.record_story_views(p_topic_id uuid, p_visitor_id text, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer := 0;
BEGIN
  IF p_topic_id IS NULL OR p_visitor_id IS NULL OR length(p_visitor_id) NOT BETWEEN 1 AND 128 THEN RETURN 0; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 100 THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM topics WHERE id = p_topic_id) THEN RETURN 0; END IF;
  INSERT INTO story_impressions AS si (topic_id, story_id, visitor_id, impression_date, paused, max_dwell_ms, position, last_seen_at)
  SELECT p_topic_id, i.story_id, p_visitor_id, CURRENT_DATE, bool_or(i.paused), LEAST(30000, GREATEST(0, MAX(i.dwell))), MIN(i.pos), now()
  FROM (SELECT (e->>'s')::uuid story_id, COALESCE((e->>'p')::boolean, false) paused, COALESCE((e->>'d')::int, 0) dwell,
               CASE WHEN (e->>'i') ~ '^[0-9]{1,3}$' THEN (e->>'i')::smallint END pos
        FROM jsonb_array_elements(p_items) e WHERE (e->>'s') ~ '^[0-9a-f-]{36}$') i
  JOIN stories s ON s.id = i.story_id JOIN topic_articles ta ON ta.id = s.topic_article_id AND ta.topic_id = p_topic_id
  GROUP BY i.story_id
  ON CONFLICT (topic_id, story_id, visitor_id, impression_date) DO UPDATE
    SET paused = si.paused OR EXCLUDED.paused,
        max_dwell_ms = GREATEST(si.max_dwell_ms, EXCLUDED.max_dwell_ms),
        position = COALESCE(si.position, EXCLUDED.position),
        last_seen_at = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

-- 2) The single signal list. p_since now also sees headline stops by their latest update.
CREATE OR REPLACE FUNCTION public.topic_engagement(p_topic_id uuid, p_from date, p_to date DEFAULT CURRENT_DATE, p_with_pauses boolean DEFAULT true, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(vid text, sid uuid, dy date, signal text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH sig AS (
    -- swipe beyond slide 1, or 10s+ on a story page after a human signal
    SELECT x.visitor_id AS raw, x.story_id AS s, x.created_at::date AS d, x.interaction_type AS k
    FROM story_interactions x
    WHERE x.topic_id = p_topic_id AND x.interaction_type IN ('swipe', 'page_dwell') AND NOT x.is_internal
      AND x.created_at >= p_from AND x.created_at < p_to + 1
      AND x.created_at >= COALESCE(p_since, '-infinity'::timestamptz)
    UNION ALL
    -- headline stop: 3s+ continuous dwell in the feed
    SELECT i.visitor_id, i.story_id, i.impression_date, 'pause'
    FROM story_impressions i
    WHERE p_with_pauses AND i.topic_id = p_topic_id AND NOT i.is_internal AND i.max_dwell_ms >= 3000
      AND i.impression_date BETWEEN p_from AND p_to
      AND COALESCE(i.last_seen_at, i.created_at) >= COALESCE(p_since, '-infinity'::timestamptz)
  )
  SELECT DISTINCT regexp_replace(g.raw, '^[a-z]+_', ''), g.s, g.d, g.k FROM sig g
  WHERE NOT is_test_visitor(g.raw)
    AND regexp_replace(g.raw, '^[a-z]+_', '') NOT IN (SELECT e.vid FROM topic_excluded_visitors(p_topic_id) e)
$function$;

-- 3) Reads = person x story x day with any read signal (headline stops included).
CREATE OR REPLACE FUNCTION public.topic_reads(p_topic_id uuid, p_from date, p_to date DEFAULT CURRENT_DATE)
 RETURNS TABLE(vid text, sid uuid, dy date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT e.vid, e.sid, e.dy FROM topic_engagement(p_topic_id, p_from, p_to, true) e
  WHERE e.sid IS NOT NULL
$function$;

-- 4) Reading now = people with a read signal in the last 5 minutes.
CREATE OR REPLACE FUNCTION public.topic_reading_now(p_topic_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(DISTINCT e.vid)::bigint
  FROM topic_engagement(p_topic_id, CURRENT_DATE - 1, CURRENT_DATE, true, now() - interval '5 minutes') e
$function$;
REVOKE EXECUTE ON FUNCTION public.topic_reading_now(uuid) FROM PUBLIC, anon, authenticated;

-- 5) Desk pulse reads the same list.
CREATE OR REPLACE FUNCTION public.get_topic_pulse(p_topic_id uuid, p_story_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_state record;
  v_result jsonb;
  v_today int; v_best_other int; v_readers_all bigint;
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN NULL; END IF;

  SELECT * INTO v_state FROM curator_topic_state WHERE user_id = auth.uid() AND topic_id = p_topic_id;

  CREATE TEMP TABLE IF NOT EXISTS _pulse_r (vid text, sid uuid, dy date) ON COMMIT DROP;
  TRUNCATE _pulse_r;
  INSERT INTO _pulse_r SELECT r.vid, r.sid, r.dy FROM topic_reads(p_topic_id, CURRENT_DATE - 29) r;

  CREATE TEMP TABLE IF NOT EXISTS _pulse_3h (vid text, sid uuid, recent boolean) ON COMMIT DROP;
  TRUNCATE _pulse_3h;
  INSERT INTO _pulse_3h
  SELECT e.vid, e.sid, false FROM topic_engagement(p_topic_id, CURRENT_DATE - 1, CURRENT_DATE, true, now() - interval '3 hours') e
  WHERE e.sid IS NOT NULL
  UNION
  SELECT e.vid, e.sid, true FROM topic_engagement(p_topic_id, CURRENT_DATE - 1, CURRENT_DATE, true, now() - interval '5 minutes') e
  WHERE e.sid IS NOT NULL;

  SELECT COUNT(*) INTO v_today FROM _pulse_r WHERE dy = CURRENT_DATE;
  SELECT COALESCE(MAX(n),0) INTO v_best_other FROM (SELECT COUNT(*) n FROM _pulse_r WHERE dy < CURRENT_DATE GROUP BY dy) d;
  v_readers_all := count_topic_readers(p_topic_id, DATE '2000-01-01');

  SELECT jsonb_build_object(
    'reading_now', topic_reading_now(p_topic_id),
    'reading_now_story_ids', COALESCE((SELECT jsonb_agg(DISTINCT sid) FROM _pulse_3h
        WHERE recent AND sid = ANY(p_story_ids)), '[]'::jsonb),
    'story_reads', COALESCE((SELECT jsonb_object_agg(sid, n) FROM (
        SELECT sid, COUNT(*) n FROM _pulse_r
        WHERE dy >= CURRENT_DATE - 6 AND sid = ANY(p_story_ids) GROUP BY sid) s), '{}'::jsonb),
    'rising_story_id', (SELECT sid FROM _pulse_3h
        GROUP BY sid HAVING COUNT(DISTINCT vid) >= 3 ORDER BY COUNT(DISTINCT vid) DESC, sid LIMIT 1),
    'last_looked_at', v_state.desk_last_looked_at,
    'new_arrivals', CASE WHEN v_state.desk_last_looked_at IS NULL THEN 0 ELSE
        (SELECT COUNT(*) FROM topic_articles WHERE topic_id = p_topic_id AND processing_status = 'new'
           AND created_at > v_state.desk_last_looked_at) END,
    'readers_all_time', v_readers_all,
    'reads_today', v_today,
    'best_other_day_30', v_best_other,
    'dismissed', to_jsonb(COALESCE(v_state.dismissed_milestones, '{}'::text[]))
  ) INTO v_result;
  RETURN v_result;
END; $function$;

-- 6) Dashboard card's "reading now" uses the same function (was: engaged readers in the last hour).
DO $$
DECLARE d text; d2 text;
BEGIN
  d := pg_get_functiondef('public.get_dashboard_feed_cards(uuid)'::regprocedure);
  d2 := regexp_replace(d,
    'SELECT COUNT\(DISTINCT e\.vid\) INTO reading_now\s+FROM topic_engagement\(t\.id, CURRENT_DATE - 1, CURRENT_DATE, true, now\(\) - interval ''1 hour''\) e;',
    'reading_now := topic_reading_now(t.id);');
  IF d2 = d THEN RAISE EXCEPTION 'get_dashboard_feed_cards reading_now statement not found'; END IF;
  EXECUTE d2;
END $$;