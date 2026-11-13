CREATE OR REPLACE FUNCTION public.get_topic_whats_on(p_topic_id uuid)
RETURNS TABLE(id uuid, title text, start_date date, start_time time without time zone, location text, source_url text, source_name text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH now_l AS (SELECT (now() AT TIME ZONE 'Europe/London') AS ts),
  today AS (SELECT ts::date AS d, ts::time AS t FROM now_l),
  firsts AS (
    SELECT DISTINCT ON (lower(btrim(e.title)))
      e.id, e.title, e.start_date, e.start_time, e.location, e.source_url, e.source_name
    FROM events e, today
    WHERE e.topic_id = p_topic_id
      AND e.status = 'published'
      AND e.start_date >= today.d
      AND e.start_date <= today.d + 31
      AND NOT (
        e.start_date = today.d AND (
          (e.start_time IS NOT NULL AND e.start_time < today.t)
          OR (e.start_time IS NULL AND today.t >= time '18:00')
        )
      )
    ORDER BY lower(btrim(e.title)), e.start_date, e.start_time NULLS LAST, (e.location IS NULL), e.created_at
  )
  SELECT f.id, f.title, f.start_date, f.start_time, f.location, f.source_url, f.source_name
  FROM firsts f
  ORDER BY f.start_date, f.start_time NULLS LAST, f.title
  LIMIT 60;
$$;