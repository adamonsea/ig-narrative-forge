ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS pinned_at timestamptz, ADD COLUMN IF NOT EXISTS pinned_until timestamptz;
CREATE INDEX IF NOT EXISTS stories_pinned_idx ON public.stories (pinned_until) WHERE pinned_until IS NOT NULL;

UPDATE public.stories s SET pinned_at = t.pinned_at, pinned_until = t.pinned_until
FROM public.topics t WHERE t.pinned_story_id = s.id AND t.pinned_until > now();

CREATE OR REPLACE FUNCTION public.set_story_pin(p_topic_id uuid, p_story_id uuid, p_hours integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_until timestamptz; v_lead record;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.can_manage_topic(p_topic_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_story_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM stories s JOIN topic_articles ta ON ta.id = s.topic_article_id
    WHERE s.id = p_story_id AND ta.topic_id = p_topic_id) THEN
    RAISE EXCEPTION 'Only a story in this feed can be pinned';
  END IF;

  IF p_story_id IS NULL THEN
    UPDATE stories s SET pinned_at = NULL, pinned_until = NULL FROM topic_articles ta
     WHERE ta.id = s.topic_article_id AND ta.topic_id = p_topic_id AND s.pinned_until IS NOT NULL;
  ELSIF coalesce(p_hours, 0) <= 0 THEN
    UPDATE stories SET pinned_at = NULL, pinned_until = NULL WHERE id = p_story_id;
  ELSE
    IF p_hours NOT IN (24, 48, 168) THEN RAISE EXCEPTION 'Pin length must be 24, 48 or 168 hours'; END IF;
    IF NOT EXISTS (SELECT 1 FROM stories WHERE id = p_story_id AND is_published = true AND status IN ('published','ready')) THEN
      RAISE EXCEPTION 'Only a live story in this feed can be pinned';
    END IF;
    IF (SELECT count(*) FROM stories s JOIN topic_articles ta ON ta.id = s.topic_article_id
        WHERE ta.topic_id = p_topic_id AND s.pinned_until > now() AND s.id <> p_story_id) >= 9 THEN
      RAISE EXCEPTION 'Up to 9 pinned stories';
    END IF;
    v_until := now() + make_interval(hours => p_hours);
    UPDATE stories SET pinned_at = CASE WHEN pinned_until > now() THEN pinned_at ELSE now() END, pinned_until = v_until
     WHERE id = p_story_id;
  END IF;

  -- The most recently pinned live story leads the feed and the emails.
  SELECT s.id, s.pinned_at, s.pinned_until INTO v_lead FROM stories s JOIN topic_articles ta ON ta.id = s.topic_article_id
   WHERE ta.topic_id = p_topic_id AND s.pinned_until > now() AND s.is_published = true
   ORDER BY s.pinned_at DESC LIMIT 1;
  UPDATE topics SET
    pinned_daily_led_at = CASE WHEN pinned_story_id IS DISTINCT FROM v_lead.id THEN NULL ELSE pinned_daily_led_at END,
    pinned_story_id = v_lead.id, pinned_at = v_lead.pinned_at, pinned_until = v_lead.pinned_until
   WHERE id = p_topic_id;
  RETURN v_until;
END $$;
REVOKE ALL ON FUNCTION public.set_story_pin(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_story_pin(uuid, uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_topic_pinned_stories(p_topic_id uuid)
RETURNS TABLE(story_id uuid, title text, slug text, cover_url text, source_name text, pinned_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.id, s.title, s.slug, s.cover_illustration_url, cs.source_name, s.pinned_until
  FROM stories s
  JOIN topic_articles ta ON ta.id = s.topic_article_id
  JOIN topics t ON t.id = ta.topic_id
  LEFT JOIN content_sources cs ON cs.id = ta.source_id
  WHERE ta.topic_id = p_topic_id AND t.is_active = true
    AND (t.is_public = true OR public.can_manage_topic(t.id))
    AND s.pinned_until > now() AND s.is_published = true AND s.status IN ('published','ready')
  ORDER BY s.pinned_at DESC
  LIMIT 9;
$$;
REVOKE ALL ON FUNCTION public.get_topic_pinned_stories(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_topic_pinned_stories(uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.set_event_pin(uuid, boolean);
DROP FUNCTION IF EXISTS public.get_topic_pinned_events(uuid);
DROP INDEX IF EXISTS public.events_topic_pinned_idx;
ALTER TABLE public.events DROP COLUMN IF EXISTS pinned_at;