ALTER TABLE public.events ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
CREATE INDEX IF NOT EXISTS events_topic_pinned_idx ON public.events (topic_id) WHERE pinned_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_event_pin(p_event_id uuid, p_pinned boolean)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_topic uuid; v_at timestamptz;
BEGIN
  SELECT topic_id INTO v_topic FROM events WHERE id = p_event_id;
  IF v_topic IS NULL OR (SELECT auth.uid()) IS NULL OR NOT public.can_manage_topic(v_topic) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_pinned THEN
    IF (SELECT count(*) FROM events WHERE topic_id = v_topic AND pinned_at IS NOT NULL AND start_date >= current_date AND id <> p_event_id) >= 9 THEN
      RAISE EXCEPTION 'Up to 9 pinned events';
    END IF;
    UPDATE events SET pinned_at = coalesce(pinned_at, now()) WHERE id = p_event_id RETURNING pinned_at INTO v_at;
  ELSE
    UPDATE events SET pinned_at = NULL WHERE id = p_event_id;
  END IF;
  RETURN v_at;
END $$;
REVOKE ALL ON FUNCTION public.set_event_pin(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_event_pin(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_topic_pinned_events(p_topic_id uuid)
RETURNS TABLE(id uuid, title text, start_date date, start_time time, location text, source_url text, event_type text, image_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT e.id, e.title, e.start_date, e.start_time, e.location, e.source_url, e.event_type,
    CASE WHEN coalesce(t.event_photos_enabled, false) AND NOT e.image_hidden THEN e.image_path END
  FROM events e JOIN topics t ON t.id = e.topic_id
  WHERE e.topic_id = p_topic_id
    AND t.is_active = true AND (t.is_public = true OR public.can_manage_topic(t.id))
    AND e.status = 'published' AND e.pinned_at IS NOT NULL
    AND e.start_date >= (now() AT TIME ZONE 'Europe/London')::date
  ORDER BY e.start_date, e.start_time NULLS LAST, e.pinned_at
  LIMIT 9;
$$;
GRANT EXECUTE ON FUNCTION public.get_topic_pinned_events(uuid) TO anon, authenticated;