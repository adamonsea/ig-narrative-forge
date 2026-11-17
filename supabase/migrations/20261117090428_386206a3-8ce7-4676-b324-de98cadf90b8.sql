CREATE OR REPLACE FUNCTION public.get_topic_source_rhythm(p_topic_id uuid)
RETURNS TABLE(source_id uuid, added_at timestamptz, last_arrival_at timestamptz, arrival_days date[], last7 integer[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
BEGIN
  IF NOT public.can_view_topic_stats(p_topic_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH arr AS (
    SELECT ta.source_id AS sid, (ta.created_at AT TIME ZONE 'Europe/London')::date AS d
    FROM topic_articles ta
    WHERE ta.topic_id = p_topic_id
      AND ta.source_id IS NOT NULL
      AND ta.created_at >= now() - interval '91 days'
  ),
  last_any AS (
    SELECT ta.source_id AS sid, max(ta.created_at) AS m
    FROM topic_articles ta
    WHERE ta.topic_id = p_topic_id AND ta.source_id IS NOT NULL
    GROUP BY ta.source_id
  ),
  days AS (
    SELECT g::date AS d FROM generate_series(v_today - 6, v_today, interval '1 day') g
  )
  SELECT
    ts.source_id,
    ts.created_at,
    la.m,
    COALESCE((SELECT array_agg(DISTINCT a.d ORDER BY a.d) FROM arr a WHERE a.sid = ts.source_id), '{}'::date[]),
    (SELECT array_agg((SELECT count(*)::int FROM arr a WHERE a.sid = ts.source_id AND a.d = dd.d) ORDER BY dd.d) FROM days dd)
  FROM topic_sources ts
  LEFT JOIN last_any la ON la.sid = ts.source_id
  WHERE ts.topic_id = p_topic_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_topic_source_rhythm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_topic_source_rhythm(uuid) TO authenticated, service_role;