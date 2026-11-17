-- Events-led follow-ups: per-feed currency, background category check, paged individual event cards
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS event_currency text CHECK (event_currency IN ('GBP','EUR','USD'));

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS category_ai_checked boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_events_category_check
  ON public.events (event_source_id)
  WHERE event_type = 'other' AND category_locked = false AND category_ai_checked = false;

-- Individual event cards page 20 at a time, same ordering every page (date, time, title, id)
DROP FUNCTION IF EXISTS public.get_topic_events_feed(uuid);
CREATE OR REPLACE FUNCTION public.get_topic_events_feed(p_topic_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
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
  FROM firsts f
  ORDER BY f.start_date, f.start_time NULLS LAST, f.title, f.id
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;
REVOKE ALL ON FUNCTION public.get_topic_events_feed(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_topic_events_feed(uuid, integer, integer) TO anon, authenticated, service_role;