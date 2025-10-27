-- Add tone field to get_topic_stories_with_keywords function
DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(text, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_slug text,
  p_keywords text[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  story_id uuid,
  story_title text,
  story_author text,
  story_publication_name text,
  story_cover_url text,
  story_created_at timestamp with time zone,
  story_updated_at timestamp with time zone,
  story_status text,
  story_is_published boolean,
  story_is_parliamentary boolean,
  story_tone text,
  mp_name text,
  mp_party text,
  constituency text,
  slide_id uuid,
  slide_number integer,
  slide_content text,
  article_source_url text,
  article_published_at timestamp with time zone,
  article_region text,
  article_id uuid,
  shared_content_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_topic_id uuid;
BEGIN
  -- Look up topic ID from slug (case-insensitive)
  SELECT id INTO v_topic_id
  FROM topics
  WHERE lower(slug) = lower(p_topic_slug)
    AND is_active = true
  LIMIT 1;
  
  IF v_topic_id IS NULL THEN
    RETURN;
  END IF;
  
  RETURN QUERY
  -- Multi-tenant architecture stories
  SELECT 
    s.id as story_id,
    s.title as story_title,
    s.author as story_author,
    s.publication_name as story_publication_name,
    s.cover_illustration_url as story_cover_url,
    s.created_at as story_created_at,
    s.updated_at as story_updated_at,
    s.status as story_status,
    s.is_published as story_is_published,
    s.is_parliamentary as story_is_parliamentary,
    s.tone as story_tone,
    pm.mp_name,
    pm.party as mp_party,
    pm.constituency,
    sl.id as slide_id,
    sl.slide_number,
    sl.content as slide_content,
    sac.url as article_source_url,
    sac.published_at as article_published_at,
    ''::text as article_region,
    ta.id as article_id,
    sac.id as shared_content_id
  FROM stories s
  JOIN topic_articles ta ON ta.id = s.topic_article_id
  JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  LEFT JOIN slides sl ON sl.story_id = s.id
  LEFT JOIN parliamentary_mentions pm ON pm.story_id = s.id
  WHERE ta.topic_id = v_topic_id
    AND s.is_published = true
    AND s.status IN ('ready', 'published')
    AND (p_keywords IS NULL OR ta.keyword_matches && p_keywords)
    AND (p_sources IS NULL OR 
         sac.source_domain = ANY(p_sources) OR
         EXISTS (SELECT 1 FROM unnest(p_sources) src WHERE sac.url ILIKE '%'||src||'%'))
  
  UNION ALL
  
  -- Legacy architecture stories
  SELECT 
    s.id as story_id,
    s.title as story_title,
    s.author as story_author,
    s.publication_name as story_publication_name,
    s.cover_illustration_url as story_cover_url,
    s.created_at as story_created_at,
    s.updated_at as story_updated_at,
    s.status as story_status,
    s.is_published as story_is_published,
    s.is_parliamentary as story_is_parliamentary,
    s.tone as story_tone,
    pm.mp_name,
    pm.party as mp_party,
    pm.constituency,
    sl.id as slide_id,
    sl.slide_number,
    sl.content as slide_content,
    a.source_url as article_source_url,
    a.published_at as article_published_at,
    COALESCE(a.region, '') as article_region,
    a.id as article_id,
    NULL::uuid as shared_content_id
  FROM stories s
  JOIN articles a ON a.id = s.article_id
  LEFT JOIN slides sl ON sl.story_id = s.id
  LEFT JOIN parliamentary_mentions pm ON pm.story_id = s.id
  WHERE a.topic_id = v_topic_id
    AND s.is_published = true
    AND s.status IN ('ready', 'published')
    AND (p_keywords IS NULL OR TRUE)
    AND (p_sources IS NULL OR 
         EXISTS (SELECT 1 FROM unnest(p_sources) src WHERE a.source_url ILIKE '%'||src||'%'))
  
  ORDER BY story_created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_topic_stories_with_keywords(text, text[], text[], integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_topic_stories_with_keywords(text, text[], text[], integer, integer) TO authenticated;