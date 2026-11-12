ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_status_check
  CHECK (status = ANY (ARRAY['published'::text, 'pending'::text, 'deleted'::text, 'excluded'::text]));

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS relevance_score integer;

ALTER TABLE public.event_sources ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT false;
-- Sources that already exist publish straight to the feed today; keep it that way.
UPDATE public.event_sources SET auto_publish = true WHERE auto_publish = false;

CREATE INDEX IF NOT EXISTS events_topic_status_start_idx ON public.events (topic_id, status, start_date);

-- Owner decisions on one event (applied to every upcoming listing with the same name in the feed).
--   publish  → Live (sticks across refreshes)
--   skip / remove → Hidden (sticks across refreshes)
--   unhide   → back to Waiting
--   restore  → Live (older name for publish, kept for compatibility)
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
  IF p_action NOT IN ('publish', 'skip', 'remove', 'unhide', 'restore') THEN
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
  ELSE
    UPDATE events e
    SET status = 'published', kept_by_owner = true, exclusion_reason = NULL, updated_at = now()
    WHERE e.topic_id = v_event.topic_id
      AND (e.id = v_event.id OR (lower(btrim(e.title)) = lower(btrim(v_event.title)) AND e.start_date >= v_today))
      AND e.status IN ('pending', 'deleted', 'excluded');
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- Owner switch: trusted sources go straight to Live. Turning it on also publishes
-- what's waiting from that source, except low-relevance (possibly out-of-area) events.
CREATE OR REPLACE FUNCTION public.set_event_source_auto_publish(p_source_id uuid, p_on boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_topic uuid;
  v_count integer := 0;
  v_today date := (now() AT TIME ZONE 'Europe/London')::date;
BEGIN
  IF p_source_id IS NULL OR (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT es.topic_id INTO v_topic
  FROM event_sources es JOIN topics t ON t.id = es.topic_id
  WHERE es.id = p_source_id AND t.created_by = (select auth.uid());

  IF v_topic IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE event_sources SET auto_publish = coalesce(p_on, false), updated_at = now() WHERE id = p_source_id;

  IF coalesce(p_on, false) THEN
    UPDATE events
    SET status = 'published', updated_at = now()
    WHERE event_source_id = p_source_id
      AND status = 'pending'
      AND start_date >= v_today
      AND coalesce(relevance_score, 100) >= 25;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_event_source_auto_publish(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_event_source_auto_publish(uuid, boolean) TO authenticated;