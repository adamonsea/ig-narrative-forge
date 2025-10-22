-- Fix get_topic_stories_with_keywords to aggregate MP names and eliminate duplicates
DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(uuid, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_id uuid,
  p_keywords text[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  story_id uuid,
  story_title text,
  story_created_at timestamp with time zone,
  story_updated_at timestamp with time zone,
  story_cover_url text,
  is_parliamentary boolean,
  mp_name text,
  mp_names text[],
  mp_party text,
  constituency text,
  article_source_url text,
  article_published_at timestamp with time zone,
  slide_id uuid,
  slide_number integer,
  slide_content text,
  slide_alt_text text,
  slide_links jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- Multi-tenant stories (topic_articles)
  SELECT DISTINCT ON (s.id, sl.id)
    s.id as story_id,
    s.title as story_title,
    s.created_at as story_created_at,
    s.updated_at as story_updated_at,
    s.cover_illustration_url as story_cover_url,
    COALESCE(s.is_parliamentary, false) as is_parliamentary,
    (SELECT TRIM(REGEXP_REPLACE(pm2.mp_name, '^[Rr]t\.?\s+[Hh]on\.?\s+|\s+[Mm][Pp]$', '', 'g'))
     FROM parliamentary_mentions pm2 
     WHERE pm2.story_id = s.id 
     LIMIT 1) as mp_name,
    (SELECT array_agg(DISTINCT TRIM(REGEXP_REPLACE(pm2.mp_name, '^[Rr]t\.?\s+[Hh]on\.?\s+|\s+[Mm][Pp]$', '', 'g'))) 
     FROM parliamentary_mentions pm2 
     WHERE pm2.story_id = s.id) as mp_names,
    (SELECT pm2.party FROM parliamentary_mentions pm2 WHERE pm2.story_id = s.id LIMIT 1) as mp_party,
    (SELECT pm2.constituency FROM parliamentary_mentions pm2 WHERE pm2.story_id = s.id LIMIT 1) as constituency,
    sc.source_url as article_source_url,
    sc.published_at as article_published_at,
    sl.id as slide_id,
    sl.slide_number,
    sl.content as slide_content,
    sl.alt_text as slide_alt_text,
    sl.links as slide_links
  FROM stories s
  INNER JOIN topic_articles ta ON ta.id = s.topic_article_id
  INNER JOIN shared_article_content sc ON sc.id = ta.shared_content_id
  LEFT JOIN slides sl ON sl.story_id = s.id
  WHERE ta.topic_id = p_topic_id
    AND s.is_published = true
    AND s.status = 'ready'
    AND (p_keywords IS NULL OR ta.keyword_matches && p_keywords)
    AND (p_sources IS NULL OR EXISTS (
      SELECT 1 FROM unnest(p_sources) AS src
      WHERE sc.source_url ILIKE '%' || src || '%'
    ))
  
  UNION ALL
  
  -- Legacy stories (articles)
  SELECT DISTINCT ON (s.id, sl.id)
    s.id as story_id,
    s.title as story_title,
    s.created_at as story_created_at,
    s.updated_at as story_updated_at,
    s.cover_illustration_url as story_cover_url,
    COALESCE(s.is_parliamentary, false) as is_parliamentary,
    (SELECT TRIM(REGEXP_REPLACE(pm2.mp_name, '^[Rr]t\.?\s+[Hh]on\.?\s+|\s+[Mm][Pp]$', '', 'g'))
     FROM parliamentary_mentions pm2 
     WHERE pm2.story_id = s.id 
     LIMIT 1) as mp_name,
    (SELECT array_agg(DISTINCT TRIM(REGEXP_REPLACE(pm2.mp_name, '^[Rr]t\.?\s+[Hh]on\.?\s+|\s+[Mm][Pp]$', '', 'g'))) 
     FROM parliamentary_mentions pm2 
     WHERE pm2.story_id = s.id) as mp_names,
    (SELECT pm2.party FROM parliamentary_mentions pm2 WHERE pm2.story_id = s.id LIMIT 1) as mp_party,
    (SELECT pm2.constituency FROM parliamentary_mentions pm2 WHERE pm2.story_id = s.id LIMIT 1) as constituency,
    a.source_url as article_source_url,
    a.published_at as article_published_at,
    sl.id as slide_id,
    sl.slide_number,
    sl.content as slide_content,
    sl.alt_text as slide_alt_text,
    sl.links as slide_links
  FROM stories s
  INNER JOIN articles a ON a.id = s.article_id
  LEFT JOIN slides sl ON sl.story_id = s.id
  WHERE a.topic_id = p_topic_id
    AND s.is_published = true
    AND s.status = 'ready'
    AND (p_keywords IS NULL OR a.keywords && p_keywords)
    AND (p_sources IS NULL OR EXISTS (
      SELECT 1 FROM unnest(p_sources) AS src
      WHERE a.source_url ILIKE '%' || src || '%'
    ))
  
  ORDER BY story_created_at DESC, slide_number ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;