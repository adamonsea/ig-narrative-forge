-- Events-led feeds (Phase 1): feed settings, per-event category, price facts.
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS feed_lead text NOT NULL DEFAULT 'news' CHECK (feed_lead IN ('news','events')),
  ADD COLUMN IF NOT EXISTS event_cards text CHECK (event_cards IN ('grouped','individual'));

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_free boolean,
  ADD COLUMN IF NOT EXISTS category_locked boolean NOT NULL DEFAULT false;

-- Old event_type values onto the new per-feed category keys
UPDATE public.events SET event_type = CASE lower(coalesce(event_type,''))
  WHEN 'music' THEN 'music'
  WHEN 'comedy' THEN 'comedy'
  WHEN 'shows' THEN 'arts-theatre'
  WHEN 'musicals' THEN 'arts-theatre'
  WHEN 'shows_musicals' THEN 'arts-theatre'
  WHEN 'art_exhibitions' THEN 'arts-theatre'
  ELSE 'other' END
WHERE event_type IS NULL OR event_type NOT IN ('music','family','sport','food-drink','arts-theatre','film','talks','nightlife','outdoors','markets','comedy','workshops','other');
ALTER TABLE public.events ALTER COLUMN event_type SET DEFAULT 'other';

-- Categories a feed added beyond the starting ten, and suggestions it skipped
CREATE TABLE IF NOT EXISTS public.topic_event_categories (
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  category text NOT NULL,
  state text NOT NULL DEFAULT 'added' CHECK (state IN ('added','skipped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, category)
);
ALTER TABLE public.topic_event_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_event_categories TO authenticated;
GRANT ALL ON public.topic_event_categories TO service_role;
CREATE POLICY "Owners manage their feed's event categories" ON public.topic_event_categories
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id AND t.created_by = (select auth.uid())) OR public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id AND t.created_by = (select auth.uid())) OR public.has_role((select auth.uid()), 'admin'));

-- Individual event cards: same filters as get_topic_whats_on, longer range, with card facts
CREATE OR REPLACE FUNCTION public.get_topic_events_feed(p_topic_id uuid)
RETURNS TABLE(id uuid, title text, start_date date, start_time time without time zone, location text, source_url text, source_name text, event_type text, price text, is_free boolean, description text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  WITH now_l AS (SELECT (now() AT TIME ZONE 'Europe/London') AS ts),
  today AS (SELECT ts::date AS d, ts::time AS t FROM now_l),
  firsts AS (
    SELECT DISTINCT ON (lower(btrim(e.title)))
      e.id, e.title, e.start_date, e.start_time, e.location, e.source_url, e.source_name, e.event_type, e.price, e.is_free, e.description
    FROM events e, today
    WHERE e.topic_id = p_topic_id
      AND e.status = 'published'
      AND e.start_date >= today.d
      AND e.start_date <= today.d + 120
      AND NOT (e.start_date = today.d AND ((e.start_time IS NOT NULL AND e.start_time < today.t) OR (e.start_time IS NULL AND today.t >= time '18:00')))
    ORDER BY lower(btrim(e.title)), e.start_date, e.start_time NULLS LAST, (e.location IS NULL), e.created_at
  )
  SELECT f.id, f.title, f.start_date, f.start_time, f.location, f.source_url, f.source_name, f.event_type, f.price, f.is_free, f.description
  FROM firsts f ORDER BY f.start_date, f.start_time NULLS LAST, f.title, f.id LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.get_topic_events_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_topic_events_feed(uuid) TO anon, authenticated, service_role;

-- Owner sets an event's category (all its dates); sticks through future gathers
CREATE OR REPLACE FUNCTION public.set_event_category(p_event_id uuid, p_category text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_event events%ROWTYPE; v_count integer;
BEGIN
  IF p_category !~ '^[a-z][a-z-]{1,30}$' THEN RAISE EXCEPTION 'Invalid category'; END IF;
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF (select auth.uid()) IS NULL OR NOT (
    EXISTS (SELECT 1 FROM topics t WHERE t.id = v_event.topic_id AND t.created_by = (select auth.uid()))
    OR has_role((select auth.uid()), 'admin') OR has_role((select auth.uid()), 'superadmin')
  ) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE events SET event_type = p_category, category_locked = true, updated_at = now()
  WHERE topic_id = v_event.topic_id AND lower(btrim(title)) = lower(btrim(v_event.title));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.set_event_category(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_event_category(uuid, text) TO authenticated, service_role;

-- Accepting a suggestion: re-tag that feed's matching "Other" events (not ones the owner set)
CREATE OR REPLACE FUNCTION public.retag_topic_events(p_topic_id uuid, p_category text, p_event_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  IF p_category !~ '^[a-z][a-z-]{1,30}$' THEN RAISE EXCEPTION 'Invalid category'; END IF;
  IF (select auth.uid()) IS NULL OR NOT (
    EXISTS (SELECT 1 FROM topics t WHERE t.id = p_topic_id AND t.created_by = (select auth.uid()))
    OR has_role((select auth.uid()), 'admin') OR has_role((select auth.uid()), 'superadmin')
  ) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE events SET event_type = p_category, updated_at = now()
  WHERE topic_id = p_topic_id AND id = ANY(p_event_ids) AND event_type = 'other' AND NOT category_locked;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.retag_topic_events(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retag_topic_events(uuid, text, uuid[]) TO authenticated, service_role;