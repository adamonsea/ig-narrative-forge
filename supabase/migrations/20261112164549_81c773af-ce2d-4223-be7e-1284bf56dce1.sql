CREATE OR REPLACE FUNCTION public.get_topic_whats_on(p_topic_id uuid)
RETURNS TABLE(id uuid, title text, start_date date, start_time time without time zone, location text, source_url text, source_name text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'Europe/London')::date AS d),
  firsts AS (
    SELECT DISTINCT ON (lower(btrim(e.title)), coalesce(e.event_source_id::text, e.source_api, ''))
      e.id, e.title, e.start_date, e.start_time, e.location, e.source_url, e.source_name
    FROM events e, today
    WHERE e.topic_id = p_topic_id
      AND e.status = 'published'
      AND e.start_date >= today.d
      AND e.start_date <= today.d + 14
    ORDER BY lower(btrim(e.title)), coalesce(e.event_source_id::text, e.source_api, ''), e.start_date, e.start_time NULLS LAST
  )
  SELECT f.id, f.title, f.start_date, f.start_time, f.location, f.source_url, f.source_name
  FROM firsts f
  ORDER BY f.start_date, f.start_time NULLS LAST, f.title
  LIMIT 24;
$$;

CREATE OR REPLACE FUNCTION public.set_topic_event_visibility(p_event_id uuid, p_action text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_event events%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
  v_count integer := 0;
BEGIN
  IF p_action NOT IN ('remove', 'restore') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF (select auth.uid()) IS NULL OR NOT EXISTS (
    SELECT 1 FROM topics t WHERE t.id = v_event.topic_id AND t.created_by = (select auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_action = 'remove' THEN
    UPDATE events e
    SET status = 'deleted', kept_by_owner = false, updated_at = now()
    WHERE e.topic_id = v_event.topic_id
      AND (e.id = v_event.id OR (
        lower(btrim(e.title)) = lower(btrim(v_event.title))
        AND e.start_date >= v_today
        AND coalesce(e.event_source_id::text, e.source_api, '') = coalesce(v_event.event_source_id::text, v_event.source_api, '')
      ))
      AND e.status <> 'deleted';
  ELSE
    UPDATE events e
    SET status = 'published', kept_by_owner = true, exclusion_reason = NULL, updated_at = now()
    WHERE e.topic_id = v_event.topic_id
      AND (e.id = v_event.id OR (
        lower(btrim(e.title)) = lower(btrim(v_event.title))
        AND e.start_date >= v_today
        AND coalesce(e.event_source_id::text, e.source_api, '') = coalesce(v_event.event_source_id::text, v_event.source_api, '')
      ))
      AND e.status IN ('deleted', 'excluded');
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;