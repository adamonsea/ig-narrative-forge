ALTER TABLE public.events ADD COLUMN IF NOT EXISTS area_confirmed boolean NOT NULL DEFAULT false;

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
  IF p_action NOT IN ('publish', 'skip', 'remove', 'unhide', 'restore', 'confirm_area', 'unconfirm_area') THEN
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
    -- The owner says a flagged event is fine (or takes that back): never flag this name again.
    UPDATE events e
    SET area_confirmed = (p_action = 'confirm_area'), updated_at = now()
    WHERE e.topic_id = v_event.topic_id
      AND (e.id = v_event.id OR (lower(btrim(e.title)) = lower(btrim(v_event.title)) AND e.start_date >= v_today));
  ELSE
    -- Publishing something the location rules hid counts as the owner confirming it's local.
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