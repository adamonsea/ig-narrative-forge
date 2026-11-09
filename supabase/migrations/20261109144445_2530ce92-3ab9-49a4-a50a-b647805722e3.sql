ALTER TABLE public.story_impressions ADD COLUMN IF NOT EXISTS position smallint;

-- 1. Writer: accept optional 0-based card position ('i'); keep the first position seen that day.
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
  INSERT INTO story_impressions AS si (topic_id, story_id, visitor_id, impression_date, paused, max_dwell_ms, position)
  SELECT p_topic_id, i.story_id, p_visitor_id, CURRENT_DATE, bool_or(i.paused), LEAST(30000, GREATEST(0, MAX(i.dwell))), MIN(i.pos)
  FROM (SELECT (e->>'s')::uuid story_id, COALESCE((e->>'p')::boolean, false) paused, COALESCE((e->>'d')::int, 0) dwell,
               CASE WHEN (e->>'i') ~ '^[0-9]{1,3}$' THEN (e->>'i')::smallint END pos
        FROM jsonb_array_elements(p_items) e WHERE (e->>'s') ~ '^[0-9a-f-]{36}$') i
  JOIN stories s ON s.id = i.story_id JOIN topic_articles ta ON ta.id = s.topic_article_id AND ta.topic_id = p_topic_id
  GROUP BY i.story_id
  ON CONFLICT (topic_id, story_id, visitor_id, impression_date) DO UPDATE
    SET paused = si.paused OR EXCLUDED.paused,
        max_dwell_ms = GREATEST(si.max_dwell_ms, EXCLUDED.max_dwell_ms),
        position = COALESCE(si.position, EXCLUDED.position);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

-- 2. The one story score. Position-corrected stop rate: observed stops vs what each card's slot usually gets
--    (feed's own 28-day slot baseline, slots 10+ pooled, smoothed), shrunk toward 1.0. Floor: 30 distinct outside readers.
--    Not callable by app users; only guarded SECURITY DEFINER functions use it.
CREATE OR REPLACE FUNCTION public.story_stop_scores(p_topic_id uuid, p_since date)
RETURNS TABLE(story_id uuid, seen bigint, stop_rate numeric, expected_rate numeric, score numeric, qualifies boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH internal AS (
    SELECT DISTINCT regexp_replace(sv.visitor_id, '^[a-z]+_', '') vid FROM site_visits sv
    WHERE sv.topic_id = p_topic_id AND sv.is_internal AND sv.visitor_id IS NOT NULL
  ), imp AS (
    SELECT si.story_id sid, regexp_replace(si.visitor_id, '^[a-z]+_', '') vid, si.impression_date d,
           si.paused::int stopped, LEAST(si.position, 9) bucket
    FROM story_impressions si
    WHERE si.topic_id = p_topic_id AND NOT si.is_internal AND si.position IS NOT NULL
      AND si.impression_date >= LEAST(p_since, CURRENT_DATE - 27)
      AND regexp_replace(si.visitor_id, '^[a-z]+_', '') NOT IN (SELECT vid FROM internal)
  ), overall AS (
    SELECT COALESCE(AVG(stopped)::numeric, 0) r FROM imp
  ), base AS (
    SELECT bucket, (SUM(stopped) + 10 * (SELECT r FROM overall)) / (COUNT(*) + 10) AS ex FROM imp GROUP BY bucket
  ), per_story AS (
    SELECT i.sid, COUNT(DISTINCT i.vid) n_seen, COUNT(*) n_rows, SUM(i.stopped) n_stops, SUM(b.ex) n_expected
    FROM imp i JOIN base b ON b.bucket = i.bucket
    WHERE i.d >= p_since GROUP BY i.sid
  )
  SELECT p.sid, p.n_seen, round(p.n_stops::numeric / p.n_rows, 4), round(p.n_expected / p.n_rows, 4),
         round((p.n_stops + 3) / (p.n_expected + 3), 3), p.n_seen >= 30
  FROM per_story p
$function$;
REVOKE ALL ON FUNCTION public.story_stop_scores(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.story_stop_scores(uuid, date) TO service_role;

-- 3. Readership: add scroll drop-off and top headline stopper (still guarded).
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

  -- Drop-off: each outside reader-day's deepest card (0-based). Shown only from 30 reader-days.
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
  ), top AS (
    SELECT s.id, s.title, s.cover_illustration_url, x.n FROM (
      SELECT story_id, COUNT(*) n FROM reads WHERE day >= v_week_start GROUP BY story_id ORDER BY n DESC LIMIT 5
    ) x JOIN stories s ON s.id = x.story_id
  ), days AS (
    SELECT d::date AS day, (SELECT COUNT(*) FROM reads WHERE reads.day = d::date) n
    FROM generate_series(v_week_start, CURRENT_DATE, interval '1 day') d
  )
  SELECT jsonb_build_object(
    'reads_week', (SELECT COUNT(*) FROM reads WHERE day >= v_week_start),
    'reads_prev_week', (SELECT COUNT(*) FROM reads WHERE day < v_week_start),
    'readers_week', count_topic_visitors(p_topic_id, v_week_start),
    'daily', (SELECT jsonb_agg(jsonb_build_object('day', day, 'reads', n) ORDER BY day) FROM days),
    'top_stories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'reads', n, 'image', cover_illustration_url) ORDER BY n DESC) FROM top), '[]'::jsonb),
    'dropoff', v_dropoff,
    'top_stopper', (SELECT jsonb_build_object('id', s.id, 'title', s.title, 'image', s.cover_illustration_url,
                      'seen', x.seen, 'stop_rate', x.stop_rate, 'expected_rate', x.expected_rate, 'score', x.score)
                    FROM story_stop_scores(p_topic_id, v_week_start) x JOIN stories s ON s.id = x.story_id
                    WHERE x.qualifies ORDER BY x.score DESC, x.seen DESC LIMIT 1)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- 4. Widget: expose qualified position-corrected scores for the shelf (service role only, aggregates only).
CREATE OR REPLACE FUNCTION public.get_widget_social_proof(p_topic_id uuid, p_story_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_internal text[];
  v_readers bigint;
BEGIN
  -- Only the widget edge function (service role) may call this; it returns public-safe aggregates only.
  IF COALESCE((select auth.role()), '') <> 'service_role' THEN RETURN NULL; END IF;

  SELECT COALESCE(array_agg(DISTINCT visitor_id), ARRAY[]::text[]) INTO v_internal
    FROM site_visits WHERE topic_id = p_topic_id AND is_internal;
  v_readers := count_topic_visitors(p_topic_id, DATE '2000-01-01');

  RETURN (
    WITH reads AS (
      SELECT DISTINCT ON (r.visitor_id, r.story_id, r.at::date) r.visitor_id, r.story_id, r.at FROM (
        SELECT si.visitor_id, si.story_id, si.created_at at FROM story_interactions si
          WHERE si.topic_id = p_topic_id AND si.interaction_type = 'swipe' AND si.story_id = ANY(p_story_ids)
            AND NOT si.is_internal AND si.created_at >= CURRENT_DATE - 6
        UNION ALL
        SELECT sv.visitor_id, (substring(sv.page_path from '/story/([0-9a-f-]{36})'))::uuid, sv.created_at FROM site_visits sv
          WHERE sv.topic_id = p_topic_id AND sv.page_type = 'story' AND NOT sv.is_internal
            AND sv.page_path ~ '/story/[0-9a-f-]{36}' AND sv.visit_date >= CURRENT_DATE - 6
      ) r WHERE r.visitor_id IS NOT NULL AND r.story_id = ANY(p_story_ids) AND NOT (r.visitor_id = ANY(v_internal))
      ORDER BY r.visitor_id, r.story_id, r.at::date, r.at DESC
    )
    SELECT jsonb_build_object(
      'readers_all_time', v_readers,
      'story_reads', COALESCE((SELECT jsonb_object_agg(story_id, n) FROM (SELECT story_id, COUNT(*) n FROM reads GROUP BY story_id) s), '{}'::jsonb),
      'stop_scores', COALESCE((SELECT jsonb_object_agg(x.story_id, x.score) FROM story_stop_scores(p_topic_id, CURRENT_DATE - 6) x
                                WHERE x.qualifies AND x.story_id = ANY(p_story_ids)), '{}'::jsonb),
      'trending_story_id', (SELECT story_id FROM reads WHERE at > now() - interval '3 hours'
          GROUP BY story_id HAVING COUNT(*) >= 3 ORDER BY COUNT(*) DESC, MAX(at) DESC LIMIT 1)
    )
  );
END; $function$;

-- 5. Dashboard card: same score and floor. "Typical" becomes what the story's feed slots usually get.
DO $do$
DECLARE d text; d2 text;
BEGIN
  SELECT pg_get_functiondef('public.get_dashboard_feed_cards(uuid)'::regprocedure) INTO d;
  d2 := regexp_replace(d,
    'SELECT s\.id, s\.title, x\.rate, x\.seen INTO top_stop_story_id.*?>= 20\) z;',
    $r$SELECT s.id, s.title, x.stop_rate, x.seen, x.expected_rate, x.n_q
      INTO top_stop_story_id, top_stop_story_title, top_stop_rate, top_stop_seen, median_stop_rate, stop_qualifying_stories
      FROM (SELECT y.*, (COUNT(*) OVER ())::int n_q FROM story_stop_scores(t.id, v_week_start) y WHERE y.qualifies) x
      JOIN stories s ON s.id = x.story_id ORDER BY x.score DESC, x.seen DESC LIMIT 1;
    IF NOT FOUND THEN top_stop_story_id := NULL; top_stop_story_title := NULL; top_stop_rate := NULL; top_stop_seen := NULL;
      median_stop_rate := NULL; stop_qualifying_stories := 0; END IF;$r$);
  IF d2 = d THEN RAISE EXCEPTION 'dashboard card headline block not found'; END IF;
  EXECUTE d2;
END $do$;

-- 6. Replaced by the top headline stopper.
DROP FUNCTION IF EXISTS public.get_topic_eye_catching(uuid);