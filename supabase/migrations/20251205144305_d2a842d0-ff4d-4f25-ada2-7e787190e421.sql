-- Fix source attribution by renaming article_url to article_source_url in the RPC
-- This aligns with what the frontend expects

DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(uuid, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_id uuid,
  p_keyword_filters text[] DEFAULT NULL,
  p_source_filters text[] DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  story_id uuid,
  story_title text,
  story_status text,
  story_created_at timestamp with time zone,
  story_updated_at timestamp with time zone,
  story_is_published boolean,
  story_slug text,
  story_tone text,
  story_writing_style text,
  story_audience_expertise text,
  story_cover_illustration_url text,
  story_animated_illustration_url text,
  topic_article_id uuid,
  shared_content_id uuid,
  article_title text,
  article_source_url text,
  article_author text,
  article_published_at timestamp with time zone,
  article_source_id uuid,
  source_name text,
  source_canonical_domain text,
  slide_id uuid,
  slide_number integer,
  slide_content text,
  slide_word_count integer,
  slide_alt_text text,
  matched_keywords text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_keyword_filters boolean := (p_keyword_filters IS NOT NULL AND array_length(p_keyword_filters, 1) > 0);
  v_has_source_filters boolean := (p_source_filters IS NOT NULL AND array_length(p_source_filters, 1) > 0);
BEGIN
  RETURN QUERY
  WITH story_ids AS (
    SELECT DISTINCT s.id as sid, s.created_at as s_created
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    LEFT JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    LEFT JOIN content_sources cs ON cs.id = ta.source_id
    WHERE ta.topic_id = p_topic_id
      AND ta.processing_status = 'processed'
      AND s.status = 'published'
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
    ORDER BY s.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT 
    s.id as story_id,
    s.title as story_title,
    s.status as story_status,
    s.created_at as story_created_at,
    s.updated_at as story_updated_at,
    s.is_published as story_is_published,
    s.slug as story_slug,
    s.tone as story_tone,
    s.writing_style as story_writing_style,
    s.audience_expertise as story_audience_expertise,
    s.cover_illustration_url as story_cover_illustration_url,
    s.animated_illustration_url as story_animated_illustration_url,
    ta.id as topic_article_id,
    ta.shared_content_id,
    sac.title as article_title,
    sac.url as article_source_url,
    sac.author as article_author,
    sac.published_at as article_published_at,
    ta.source_id as article_source_id,
    cs.source_name,
    cs.canonical_domain as source_canonical_domain,
    sl.id as slide_id,
    sl.slide_number,
    sl.content as slide_content,
    sl.word_count as slide_word_count,
    sl.alt_text as slide_alt_text,
    CASE WHEN v_has_keyword_filters THEN
      ARRAY(
        SELECT DISTINCT kf FROM unnest(p_keyword_filters) kf
        WHERE LOWER(s.title) LIKE '%' || LOWER(kf) || '%'
           OR LOWER(sac.title) LIKE '%' || LOWER(kf) || '%'
      )
    ELSE NULL END as matched_keywords
  FROM story_ids si
  JOIN stories s ON s.id = si.sid
  JOIN topic_articles ta ON ta.id = s.topic_article_id
  LEFT JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  LEFT JOIN content_sources cs ON cs.id = ta.source_id
  LEFT JOIN slides sl ON sl.story_id = s.id
  ORDER BY s.created_at DESC, sl.slide_number ASC;
END;
$function$;