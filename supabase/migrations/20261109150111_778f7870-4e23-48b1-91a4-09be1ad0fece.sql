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
    -- A stop = 3s+ continuous dwell, derived from raw dwell so old and new rows share one rule.
    SELECT si.story_id sid, regexp_replace(si.visitor_id, '^[a-z]+_', '') vid, si.impression_date d,
           (si.max_dwell_ms >= 3000)::int stopped, LEAST(si.position, 9) bucket
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