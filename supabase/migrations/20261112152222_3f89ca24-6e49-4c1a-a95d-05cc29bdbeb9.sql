-- Per-story read-through: of outside reader-days that saw a story this period, the share that swiped into it.
-- Lives in the one story score so the same rows, exclusions and 30-reader floor apply to stop and swipe rates.
DROP FUNCTION IF EXISTS public.story_stop_scores(uuid, date);
CREATE FUNCTION public.story_stop_scores(p_topic_id uuid, p_since date)
RETURNS TABLE(story_id uuid, seen bigint, stop_rate numeric, expected_rate numeric, score numeric, qualifies boolean, swipe_rate numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH internal AS (
    SELECT DISTINCT regexp_replace(sv.visitor_id, '^[a-z]+_', '') vid FROM site_visits sv
    WHERE sv.topic_id = p_topic_id AND sv.is_internal AND sv.visitor_id IS NOT NULL
  ), imp AS (
    -- A stop = 3s+ continuous dwell, derived from raw dwell so old and new rows share one rule.
    SELECT si.story_id sid, regexp_replace(si.visitor_id, '^[a-z]+_', '') vid, si.impression_date d,
           (si.max_dwell_ms >= 3000)::int stopped, LEAST(si.position, 9) bucket
    FROM story_impressions si
    WHERE si.topic_id = p_topic_id AND NOT si.is_internal AND si.position IS NOT NULL
      AND si.impression_date >= LEAST(p_since, CURRENT_DATE - 27)
      AND regexp_replace(si.visitor_id, '^[a-z]+_', '') NOT IN (SELECT vid FROM internal)
  ), sw AS (
    SELECT DISTINCT x.story_id sid, regexp_replace(x.visitor_id, '^[a-z]+_', '') vid, x.created_at::date d
    FROM story_interactions x
    WHERE x.topic_id = p_topic_id AND x.interaction_type = 'swipe' AND NOT x.is_internal
      AND x.story_id IS NOT NULL AND x.visitor_id IS NOT NULL AND x.created_at >= p_since
  ), overall AS (
    SELECT COALESCE(AVG(stopped)::numeric, 0) r FROM imp
  ), base AS (
    SELECT bucket, (SUM(stopped) + 10 * (SELECT r FROM overall)) / (COUNT(*) + 10) AS ex FROM imp GROUP BY bucket
  ), per_story AS (
    SELECT i.sid, COUNT(DISTINCT i.vid) n_seen, COUNT(*) n_rows, SUM(i.stopped) n_stops, SUM(b.ex) n_expected,
           COUNT(sw.sid) n_swiped
    FROM imp i JOIN base b ON b.bucket = i.bucket
    LEFT JOIN sw ON sw.sid = i.sid AND sw.vid = i.vid AND sw.d = i.d
    WHERE i.d >= p_since GROUP BY i.sid
  )
  SELECT p.sid, p.n_seen, round(p.n_stops::numeric / p.n_rows, 4), round(p.n_expected / p.n_rows, 4),
         round((p.n_stops + 3) / (p.n_expected + 3), 3), p.n_seen >= 30,
         round(p.n_swiped::numeric / p.n_rows, 4)
  FROM per_story p
$function$;
REVOKE ALL ON FUNCTION public.story_stop_scores(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.story_stop_scores(uuid, date) TO service_role;

-- Readership: top stories carry stopped % and swiped % once they pass the story floor.
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
                    WHERE x.qualifies ORDER BY x.score DESC, x.seen DESC LIMIT 1)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;