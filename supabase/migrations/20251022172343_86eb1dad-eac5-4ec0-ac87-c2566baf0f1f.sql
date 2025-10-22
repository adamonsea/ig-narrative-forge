-- Emergency rollback: Restore working get_topic_stories_with_keywords function
DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(text, text[], text[], integer, integer);
DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(uuid, text[], text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_id uuid,
  p_keywords text[] DEFAULT NULL,
  p_source_domains text[] DEFAULT NULL,
  p_mp_names text[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  story_id uuid,
  story_title text,
  story_created_at timestamptz,
  article_source_url text,
  article_published_at timestamptz,
  cover_illustration_url text,
  slide_id uuid,
  slide_content text,
  slide_number integer,
  is_parliamentary boolean,
  mp_name text,
  mp_party text,
  constituency text
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered_stories AS (
    SELECT DISTINCT ON (s.id)
      s.id,
      s.title,
      s.created_at,
      s.cover_illustration_url,
      s.is_parliamentary,
      COALESCE(sac.url, a.url) as source_url,
      COALESCE(sac.published_at, a.published_at) as published_at
    FROM stories s
    LEFT JOIN topic_articles ta ON s.id = ta.story_id AND ta.topic_id = p_topic_id
    LEFT JOIN shared_article_content sac ON ta.article_id = sac.id
    LEFT JOIN articles a ON s.article_id = a.id
    WHERE (ta.topic_id = p_topic_id OR s.topic_id = p_topic_id)
      AND s.status = 'published'
      AND (p_keywords IS NULL OR ta.keyword_matches && p_keywords OR a.id IS NOT NULL)
      AND (p_source_domains IS NULL OR 
           (sac.url IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_source_domains) d WHERE sac.url ILIKE '%' || d || '%')) OR
           (a.url IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_source_domains) d WHERE a.url ILIKE '%' || d || '%')))
    ORDER BY s.id, COALESCE(sac.published_at, a.published_at, s.created_at) DESC
  )
  SELECT 
    fs.id as story_id,
    fs.title as story_title,
    fs.created_at as story_created_at,
    fs.source_url as article_source_url,
    fs.published_at as article_published_at,
    fs.cover_illustration_url,
    sl.id as slide_id,
    sl.content as slide_content,
    sl.slide_number,
    fs.is_parliamentary,
    pm.mp_name,
    pm.mp_party,
    pm.constituency
  FROM filtered_stories fs
  LEFT JOIN slides sl ON fs.id = sl.story_id
  LEFT JOIN parliamentary_mentions pm ON fs.id = pm.story_id 
    AND (p_mp_names IS NULL OR pm.mp_name = ANY(p_mp_names))
  WHERE sl.id IS NOT NULL
  ORDER BY COALESCE(fs.published_at, fs.created_at) DESC, sl.slide_number ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;