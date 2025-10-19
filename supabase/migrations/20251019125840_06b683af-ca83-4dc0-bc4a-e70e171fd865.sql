-- Update get_topic_stories_with_keywords to include parliamentary mention data
CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_keyword_filter text[] DEFAULT NULL,
  p_source_filter uuid[] DEFAULT NULL
)
RETURNS TABLE(
  story_id uuid,
  story_title text,
  story_author text,
  story_publication_name text,
  story_cover_illustration_url text,
  story_created_at timestamp with time zone,
  story_updated_at timestamp with time zone,
  story_is_parliamentary boolean,
  mp_name text,
  mp_party text,
  constituency text,
  slide_id uuid,
  slide_number integer,
  slide_content text,
  article_url text,
  article_published_at timestamp with time zone,
  article_region text,
  keyword_matches text[],
  source_id uuid,
  source_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  -- Multi-tenant architecture stories
  SELECT 
    s.id as story_id,
    s.title as story_title,
    s.author as story_author,
    s.publication_name as story_publication_name,
    s.cover_illustration_url as story_cover_illustration_url,
    s.created_at as story_created_at,
    s.updated_at as story_updated_at,
    s.is_parliamentary as story_is_parliamentary,
    pm.mp_name,
    pm.party as mp_party,
    pm.constituency,
    sl.id as slide_id,
    sl.slide_number,
    sl.content as slide_content,
    sac.url as article_url,
    sac.published_at as article_published_at,
    ''::text as article_region,
    ta.keyword_matches,
    ta.source_id,
    cs.source_name
  FROM stories s
  JOIN topic_articles ta ON ta.id = s.topic_article_id
  JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  LEFT JOIN slides sl ON sl.story_id = s.id
  LEFT JOIN content_sources cs ON cs.id = ta.source_id
  LEFT JOIN parliamentary_mentions pm ON pm.story_id = s.id
  WHERE ta.topic_id = p_topic_id
    AND s.is_published = true
    AND s.status IN ('ready', 'published')
    AND (p_keyword_filter IS NULL OR ta.keyword_matches && p_keyword_filter)
    AND (p_source_filter IS NULL OR ta.source_id = ANY(p_source_filter))
  
  UNION ALL
  
  -- Legacy architecture stories
  SELECT 
    s.id as story_id,
    s.title as story_title,
    s.author as story_author,
    s.publication_name as story_publication_name,
    s.cover_illustration_url as story_cover_illustration_url,
    s.created_at as story_created_at,
    s.updated_at as story_updated_at,
    s.is_parliamentary as story_is_parliamentary,
    pm.mp_name,
    pm.party as mp_party,
    pm.constituency,
    sl.id as slide_id,
    sl.slide_number,
    sl.content as slide_content,
    a.source_url as article_url,
    a.published_at as article_published_at,
    COALESCE(a.region, '') as article_region,
    ARRAY[]::text[] as keyword_matches,
    a.source_id,
    cs.source_name
  FROM stories s
  JOIN articles a ON a.id = s.article_id
  LEFT JOIN slides sl ON sl.story_id = s.id
  LEFT JOIN content_sources cs ON cs.id = a.source_id
  LEFT JOIN parliamentary_mentions pm ON pm.story_id = s.id
  WHERE a.topic_id = p_topic_id
    AND s.is_published = true
    AND s.status IN ('ready', 'published')
    AND (p_keyword_filter IS NULL OR TRUE)
    AND (p_source_filter IS NULL OR a.source_id = ANY(p_source_filter))
  
  ORDER BY story_created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;