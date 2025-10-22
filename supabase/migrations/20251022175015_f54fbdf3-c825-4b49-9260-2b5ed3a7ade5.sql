-- Drop and recreate get_topic_stories_with_keywords with corrected JOIN conditions
DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(uuid, text[], text[], text[], integer, integer);

CREATE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_id uuid,
  p_keywords text[] DEFAULT NULL,
  p_source_domains text[] DEFAULT NULL,
  p_mp_names text[] DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  story_id uuid,
  story_title text,
  story_status text,
  story_is_published boolean,
  story_is_parliamentary boolean,
  story_created_at timestamp with time zone,
  story_cover_url text,
  article_id uuid,
  article_source_url text,
  article_published_at timestamp with time zone,
  slide_id uuid,
  slide_number integer,
  slide_content text,
  content_type text,
  shared_content_id uuid,
  mp_name text,
  mp_party text,
  constituency text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base_stories AS (
    -- Multi-tenant architecture stories
    SELECT DISTINCT
      s.id as story_id,
      s.title as story_title,
      s.status as story_status,
      s.is_published as story_is_published,
      COALESCE(s.is_parliamentary, false) as story_is_parliamentary,
      s.created_at as story_created_at,
      s.cover_illustration_url as story_cover_url,
      NULL::uuid as article_id,
      sac.url as article_source_url,
      sac.published_at as article_published_at,
      'multitenant'::text as content_type,
      sac.id as shared_content_id
    FROM stories s
    JOIN topic_articles ta ON s.topic_article_id = ta.id
    JOIN shared_article_content sac ON ta.shared_content_id = sac.id
    WHERE ta.topic_id = p_topic_id
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
      AND (
        p_keywords IS NULL
        OR ta.keyword_matches && p_keywords
        OR EXISTS (
          SELECT 1 FROM unnest(p_keywords) kw
          WHERE sac.title ILIKE '%' || kw || '%'
            OR sac.body ILIKE '%' || kw || '%'
        )
      )
      AND (
        p_source_domains IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(p_source_domains) sd
          WHERE sac.url ILIKE '%' || sd || '%'
        )
      )
    
    UNION ALL
    
    -- Legacy architecture stories
    SELECT DISTINCT
      s.id as story_id,
      s.title as story_title,
      s.status as story_status,
      s.is_published as story_is_published,
      COALESCE(s.is_parliamentary, false) as story_is_parliamentary,
      s.created_at as story_created_at,
      s.cover_illustration_url as story_cover_url,
      a.id as article_id,
      a.source_url as article_source_url,
      a.published_at as article_published_at,
      'legacy'::text as content_type,
      NULL::uuid as shared_content_id
    FROM stories s
    JOIN articles a ON s.article_id = a.id
    WHERE a.topic_id = p_topic_id
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
      AND (
        p_keywords IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(p_keywords) kw
          WHERE a.title ILIKE '%' || kw || '%'
            OR a.body ILIKE '%' || kw || '%'
        )
      )
      AND (
        p_source_domains IS NULL
        OR EXISTS (
          SELECT 1 FROM unnest(p_source_domains) sd
          WHERE a.source_url ILIKE '%' || sd || '%'
        )
      )
  )
  SELECT
    bs.story_id,
    bs.story_title,
    bs.story_status,
    bs.story_is_published,
    bs.story_is_parliamentary,
    bs.story_created_at,
    bs.story_cover_url,
    bs.article_id,
    bs.article_source_url,
    bs.article_published_at,
    sl.id as slide_id,
    sl.slide_number,
    sl.content as slide_content,
    bs.content_type,
    bs.shared_content_id,
    pm.mp_name,
    pm.party as mp_party,
    pm.constituency
  FROM base_stories bs
  LEFT JOIN slides sl ON sl.story_id = bs.story_id
  LEFT JOIN parliamentary_mentions pm ON pm.story_id = bs.story_id
    AND (p_mp_names IS NULL OR pm.mp_name = ANY(p_mp_names))
  WHERE sl.id IS NOT NULL
  ORDER BY COALESCE(bs.article_published_at, bs.story_created_at) DESC, sl.slide_number ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;