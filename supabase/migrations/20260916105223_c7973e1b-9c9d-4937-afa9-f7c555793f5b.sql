DROP FUNCTION IF EXISTS public.get_public_topic_feed(text, integer, integer, text);

CREATE OR REPLACE FUNCTION public.get_public_topic_feed(topic_slug_param text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_sort_by text DEFAULT 'newest'::text)
 RETURNS TABLE(story_id uuid, story_title text, story_status text, story_created_at timestamp with time zone, story_updated_at timestamp with time zone, story_slug text, story_tone text, story_cover_illustration_url text, topic_article_id uuid, article_title text, article_url text, article_author text, article_published_at timestamp with time zone, source_name text, source_canonical_domain text, slide_id uuid, slide_number integer, slide_content text, slide_word_count integer, slide_alt_text text, display_date timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_topic_id uuid;
BEGIN
  SELECT id INTO v_topic_id
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
    ORDER BY s_display DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT
    s.id as story_id,
    s.title as story_title,
    s.status as story_status,
    s.created_at as story_created_at,
    s.updated_at as story_updated_at,
    s.slug as story_slug,
    s.tone as story_tone,
    s.cover_illustration_url as story_cover_illustration_url,
    ta.id as topic_article_id,
    sac.title as article_title,
    sac.url as article_url,
    sac.author as article_author,
    sac.published_at as article_published_at,
    cs.source_name,
    cs.canonical_domain as source_canonical_domain,
    sl.id as slide_id,
    sl.slide_number,
    sl.content as slide_content,
    sl.word_count as slide_word_count,
    sl.alt_text as slide_alt_text,
    si.s_display as display_date
  FROM story_ids si
  JOIN stories s ON s.id = si.sid
  JOIN topic_articles ta ON ta.id = s.topic_article_id
  LEFT JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  LEFT JOIN content_sources cs ON cs.id = ta.source_id
  LEFT JOIN slides sl ON sl.story_id = s.id
  ORDER BY si.s_display DESC, sl.slide_number ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_topic_feed(text, integer, integer, text) TO anon, authenticated, service_role;