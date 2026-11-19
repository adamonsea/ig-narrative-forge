ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS pinned_story_id uuid REFERENCES public.stories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_until timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_daily_led_at timestamptz;

-- Owner sets or clears the feed's one pinned story (24h, 48h or 7 days).
CREATE OR REPLACE FUNCTION public.set_story_pin(p_topic_id uuid, p_story_id uuid, p_hours integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_until timestamptz;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.can_manage_topic(p_topic_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  IF p_story_id IS NULL OR coalesce(p_hours, 0) <= 0 THEN
    UPDATE topics SET pinned_story_id = NULL, pinned_at = NULL, pinned_until = NULL WHERE id = p_topic_id;
    RETURN NULL;
  END IF;

  IF p_hours NOT IN (24, 48, 168) THEN
    RAISE EXCEPTION 'Pin length must be 24, 48 or 168 hours';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    WHERE s.id = p_story_id AND ta.topic_id = p_topic_id
      AND s.is_published = true AND s.status IN ('published', 'ready')
  ) THEN
    RAISE EXCEPTION 'Only a live story in this feed can be pinned';
  END IF;

  v_until := now() + make_interval(hours => p_hours);
  UPDATE topics
     SET pinned_at = CASE WHEN pinned_story_id = p_story_id AND pinned_until > now() THEN pinned_at ELSE now() END,
         pinned_story_id = p_story_id,
         pinned_until = v_until
   WHERE id = p_topic_id;
  RETURN v_until;
END;
$$;
REVOKE ALL ON FUNCTION public.set_story_pin(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_story_pin(uuid, uuid, integer) TO authenticated, service_role;

-- The pinned story of a public feed, only while the pin lasts and the story is live.
CREATE OR REPLACE FUNCTION public.get_topic_pin(p_topic_id uuid)
RETURNS TABLE(story_id uuid, pinned_until timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.pinned_story_id, t.pinned_until
  FROM topics t
  JOIN stories s ON s.id = t.pinned_story_id
  JOIN topic_articles ta ON ta.id = s.topic_article_id AND ta.topic_id = t.id
  WHERE t.id = p_topic_id
    AND t.is_active = true
    AND (t.is_public = true OR public.can_manage_topic(t.id))
    AND t.pinned_until > now()
    AND s.is_published = true
    AND s.status IN ('published', 'ready');
$$;
REVOKE ALL ON FUNCTION public.get_topic_pin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_topic_pin(uuid) TO anon, authenticated, service_role;

-- Public feed: pinned story first, then display date, then id.
CREATE OR REPLACE FUNCTION public.get_public_topic_feed(topic_slug_param text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_sort_by text DEFAULT 'newest'::text)
 RETURNS TABLE(story_id uuid, story_title text, story_status text, story_created_at timestamp with time zone, story_updated_at timestamp with time zone, story_slug text, story_tone text, story_cover_illustration_url text, topic_article_id uuid, article_title text, article_url text, article_author text, article_published_at timestamp with time zone, source_name text, source_canonical_domain text, slide_id uuid, slide_number integer, slide_content text, slide_word_count integer, slide_alt_text text, display_date timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_topic_id uuid;
  v_pin uuid;
BEGIN
  SELECT id, CASE WHEN pinned_until > now() THEN pinned_story_id END INTO v_topic_id, v_pin
  FROM topics
  WHERE slug = topic_slug_param
    AND is_active = true
    AND is_public = true;

  IF v_topic_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH story_ids AS (
    SELECT DISTINCT s.id as sid,
      coalesce(s.id = v_pin, false) as s_pinned,
      (CASE
         WHEN sac.published_at IS NULL THEN s.created_at
         WHEN sac.published_at > now() - interval '3 days' THEN s.created_at
         ELSE sac.published_at
       END) as s_display
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    LEFT JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    WHERE ta.topic_id = v_topic_id
      AND ta.processing_status = 'processed'
      AND s.is_published = true
      AND s.status IN ('published', 'ready')
    ORDER BY s_pinned DESC, s_display DESC, s.id DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT
    s.id, s.title, s.status, s.created_at, s.updated_at, s.slug, s.tone, s.cover_illustration_url,
    ta.id, sac.title, sac.url, sac.author, sac.published_at,
    cs.source_name, cs.canonical_domain,
    sl.id, sl.slide_number, sl.content, sl.word_count, sl.alt_text,
    si.s_display
  FROM story_ids si
  JOIN stories s ON s.id = si.sid
  JOIN topic_articles ta ON ta.id = s.topic_article_id
  LEFT JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  LEFT JOIN content_sources cs ON cs.id = ta.source_id
  LEFT JOIN slides sl ON sl.story_id = s.id
  ORDER BY si.s_pinned DESC, si.s_display DESC, si.sid DESC, sl.slide_number ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(p_topic_id uuid, p_keyword_filters text[] DEFAULT NULL::text[], p_source_filters text[] DEFAULT NULL::text[], p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(story_id uuid, story_title text, story_status text, story_created_at timestamp with time zone, story_updated_at timestamp with time zone, story_is_published boolean, story_slug text, story_tone text, story_writing_style text, story_audience_expertise text, story_cover_illustration_url text, story_animated_illustration_url text, topic_article_id uuid, shared_content_id uuid, article_title text, article_source_url text, article_author text, article_published_at timestamp with time zone, article_source_id uuid, source_name text, source_canonical_domain text, slide_id uuid, slide_number integer, slide_content text, slide_word_count integer, slide_alt_text text, matched_keywords text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_has_keyword_filters boolean := (p_keyword_filters IS NOT NULL AND array_length(p_keyword_filters, 1) > 0);
  v_has_source_filters boolean := (p_source_filters IS NOT NULL AND array_length(p_source_filters, 1) > 0);
  v_pin uuid;
BEGIN
  SELECT CASE WHEN t.pinned_until > now() THEN t.pinned_story_id END INTO v_pin FROM topics t WHERE t.id = p_topic_id;

  RETURN QUERY
  WITH story_ids AS (
    SELECT DISTINCT s.id as sid, s.created_at as s_created,
      coalesce(s.id = v_pin, false) as s_pinned,
      (CASE WHEN sac.published_at IS NULL THEN s.created_at
            WHEN sac.published_at > now() - interval '3 days' THEN s.created_at
            ELSE sac.published_at END) as s_display
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    LEFT JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    LEFT JOIN content_sources cs ON cs.id = ta.source_id
    WHERE ta.topic_id = p_topic_id
      AND ta.processing_status = 'processed'
      AND s.is_published = true
      AND s.status IN ('published', 'ready')
      AND (NOT v_has_keyword_filters OR EXISTS (
        SELECT 1 FROM unnest(p_keyword_filters) kf
        WHERE LOWER(s.title) LIKE '%' || LOWER(kf) || '%'
           OR LOWER(sac.title) LIKE '%' || LOWER(kf) || '%'
           OR EXISTS (
             SELECT 1 FROM slides sl
             WHERE sl.story_id = s.id
             AND LOWER(sl.content) LIKE '%' || LOWER(kf) || '%'
           )
      ))
      AND (NOT v_has_source_filters OR cs.canonical_domain = ANY(p_source_filters))
    ORDER BY s_pinned DESC, s_display DESC, s.id DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT
    s.id, s.title, s.status, s.created_at, s.updated_at, s.is_published, s.slug, s.tone,
    s.writing_style, s.audience_expertise, s.cover_illustration_url, s.animated_illustration_url,
    ta.id, ta.shared_content_id, sac.title, sac.url, sac.author, sac.published_at, ta.source_id,
    cs.source_name, cs.canonical_domain,
    sl.id, sl.slide_number, sl.content, sl.word_count, sl.alt_text,
    CASE WHEN v_has_keyword_filters THEN
      ARRAY(
        SELECT DISTINCT kf FROM unnest(p_keyword_filters) kf
        WHERE LOWER(s.title) LIKE '%' || LOWER(kf) || '%'
           OR LOWER(sac.title) LIKE '%' || LOWER(kf) || '%'
           OR EXISTS (
             SELECT 1 FROM slides sl2
             WHERE sl2.story_id = s.id
             AND LOWER(sl2.content) LIKE '%' || LOWER(kf) || '%'
           )
      )
    ELSE NULL END
  FROM story_ids si
  JOIN stories s ON s.id = si.sid
  JOIN topic_articles ta ON ta.id = s.topic_article_id
  LEFT JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  LEFT JOIN content_sources cs ON cs.id = ta.source_id
  LEFT JOIN slides sl ON sl.story_id = s.id
  ORDER BY si.s_pinned DESC, si.s_display DESC, si.sid DESC, sl.slide_number ASC;
END;
$function$;