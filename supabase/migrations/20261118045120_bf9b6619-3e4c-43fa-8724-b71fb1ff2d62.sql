-- Event photos: a stored, shrunk copy of the listing's own image (never hotlinked)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS image_source_url text,
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS image_status text,
  ADD COLUMN IF NOT EXISTS image_hidden boolean NOT NULL DEFAULT false;

ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS event_photos_enabled boolean NOT NULL DEFAULT true;

-- Photos still waiting to be saved, per source
CREATE INDEX IF NOT EXISTS events_image_todo_idx ON public.events (event_source_id)
  WHERE image_source_url IS NOT NULL AND image_path IS NULL AND image_status IS NULL;
CREATE INDEX IF NOT EXISTS events_image_path_idx ON public.events (topic_id) WHERE image_path IS NOT NULL;

-- Individual event cards: add the photo path (only when the feed shows photos and the owner hasn't swapped it)
DROP FUNCTION IF EXISTS public.get_topic_events_feed(uuid, integer, integer);
CREATE FUNCTION public.get_topic_events_feed(p_topic_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, start_date date, start_time time without time zone, location text, source_url text, source_name text, event_type text, price text, is_free boolean, description text, image_path text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH now_l AS (SELECT (now() AT TIME ZONE 'Europe/London') AS ts),
  today AS (SELECT ts::date AS d, ts::time AS t FROM now_l),
  photos AS (SELECT coalesce((SELECT t.event_photos_enabled FROM topics t WHERE t.id = p_topic_id), false) AS on_),
  firsts AS (
    SELECT DISTINCT ON (lower(btrim(e.title)))
      e.id, e.title, e.start_date, e.start_time, e.location, e.source_url, e.source_name, e.event_type, e.price, e.is_free, e.description,
      CASE WHEN photos.on_ AND NOT e.image_hidden THEN e.image_path END AS image_path
    FROM events e, today, photos
    WHERE e.topic_id = p_topic_id
      AND e.status = 'published'
      AND e.start_date >= today.d
      AND e.start_date <= today.d + 120
      AND NOT (e.start_date = today.d AND ((e.start_time IS NOT NULL AND e.start_time < today.t) OR (e.start_time IS NULL AND today.t >= time '18:00')))
    ORDER BY lower(btrim(e.title)), e.start_date, e.start_time NULLS LAST, (e.location IS NULL), e.created_at
  )
  SELECT f.id, f.title, f.start_date, f.start_time, f.location, f.source_url, f.source_name, f.event_type, f.price, f.is_free, f.description, f.image_path
  FROM firsts f
  ORDER BY f.start_date, f.start_time NULLS LAST, f.title, f.id
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$function$;
REVOKE ALL ON FUNCTION public.get_topic_events_feed(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_topic_events_feed(uuid, integer, integer) TO anon, authenticated, service_role;

-- Owner actions: add "use illustration" / "use photo" (sticky per event name, like other decisions)
CREATE OR REPLACE FUNCTION public.set_topic_event_visibility(p_event_id uuid, p_action text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event events%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
  v_count integer := 0;
BEGIN
  IF p_action NOT IN ('publish', 'skip', 'remove', 'unhide', 'restore', 'confirm_area', 'unconfirm_area', 'hide_photo', 'show_photo') THEN
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

  IF p_action IN ('skip', 'remove') THEN
    UPDATE events e
    SET status = 'deleted', kept_by_owner = false, updated_at = now()
    WHERE e.topic_id = v_event.topic_id
      AND (e.id = v_event.id OR (lower(btrim(e.title)) = lower(btrim(v_event.title)) AND e.start_date >= v_today))
      AND e.status <> 'deleted';
  ELSIF p_action = 'unhide' THEN
    UPDATE events e
    SET status = 'pending', kept_by_owner = false, exclusion_reason = NULL, updated_at = now()
    WHERE e.topic_id = v_event.topic_id
      AND (e.id = v_event.id OR (lower(btrim(e.title)) = lower(btrim(v_event.title)) AND e.start_date >= v_today))
      AND e.status IN ('deleted', 'excluded');
  ELSIF p_action IN ('confirm_area', 'unconfirm_area') THEN
    UPDATE events e
    SET area_confirmed = (p_action = 'confirm_area'), updated_at = now()
    WHERE e.topic_id = v_event.topic_id
      AND (e.id = v_event.id OR (lower(btrim(e.title)) = lower(btrim(v_event.title)) AND e.start_date >= v_today));
  ELSIF p_action IN ('hide_photo', 'show_photo') THEN
    -- The stored file is deleted by the next gather's sweep; showing it again re-saves it then.
    UPDATE events e
    SET image_hidden = (p_action = 'hide_photo'), updated_at = now()
    WHERE e.topic_id = v_event.topic_id
      AND (e.id = v_event.id OR (lower(btrim(e.title)) = lower(btrim(v_event.title)) AND e.start_date >= v_today));
  ELSE
    UPDATE events e
    SET status = 'published', kept_by_owner = true, exclusion_reason = NULL,
        area_confirmed = (e.area_confirmed OR e.status = 'excluded'), updated_at = now()
    WHERE e.topic_id = v_event.topic_id
      AND (e.id = v_event.id OR (lower(btrim(e.title)) = lower(btrim(v_event.title)) AND e.start_date >= v_today))
      AND e.status IN ('pending', 'deleted', 'excluded');
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;