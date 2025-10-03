-- Phase 2: Enhance get_topic_stories_with_keywords with source filtering
CREATE OR REPLACE FUNCTION get_topic_stories_with_keywords(
  p_topic_slug text,
  p_keywords text[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,  -- NEW: Source domain filter
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  title text,
  author text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  cover_illustration_url text,
  cover_illustration_prompt text,
  article_source_url text,
  article_published_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH topic_info AS (
    SELECT id FROM topics WHERE slug = p_topic_slug AND is_public = true AND is_active = true
  ),
  -- Legacy path: stories from articles table
  legacy_stories AS (
    SELECT DISTINCT
      s.id,
      s.title,
      s.author,
      s.created_at,
      s.updated_at,
      s.cover_illustration_url,
      s.cover_illustration_prompt,
      a.source_url as article_source_url,
      a.published_at as article_published_at,
      s.is_published,
      s.status,
      a.id as article_id
    FROM stories s
    JOIN articles a ON a.id = s.article_id
    WHERE a.topic_id = (SELECT id FROM topic_info)
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
  ),
  -- Multi-tenant path: stories from topic_articles + shared_article_content
  multitenant_stories AS (
    SELECT DISTINCT
      s.id,
      s.title,
      s.author,
      s.created_at,
      s.updated_at,
      s.cover_illustration_url,
      s.cover_illustration_prompt,
      sac.url as article_source_url,
      sac.published_at as article_published_at,
      s.is_published,
      s.status,
      NULL::uuid as article_id
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    WHERE ta.topic_id = (SELECT id FROM topic_info)
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
  ),
  -- Combine both paths
  all_candidate_stories AS (
    SELECT * FROM legacy_stories
    UNION ALL
    SELECT * FROM multitenant_stories
  ),
  -- Apply source filtering if provided
  source_filtered_stories AS (
    SELECT *
    FROM all_candidate_stories acs
    WHERE p_sources IS NULL 
      OR EXISTS (
        SELECT 1
        FROM unnest(p_sources) AS source_domain
        WHERE acs.article_source_url ILIKE '%' || source_domain || '%'
      )
  ),
  -- Apply keyword filtering if provided
  keyword_filtered_stories AS (
    SELECT sfs.*
    FROM source_filtered_stories sfs
    WHERE p_keywords IS NULL
      OR EXISTS (
        SELECT 1
        FROM slides sl
        WHERE sl.story_id = sfs.id
          AND (
            EXISTS (
              SELECT 1
              FROM unnest(p_keywords) AS keyword
              WHERE lower(sl.content) LIKE '%' || lower(keyword) || '%'
                OR lower(sfs.title) LIKE '%' || lower(keyword) || '%'
            )
          )
      )
  )
  SELECT 
    kfs.id,
    kfs.title,
    kfs.author,
    kfs.created_at,
    kfs.updated_at,
    kfs.cover_illustration_url,
    kfs.cover_illustration_prompt,
    kfs.article_source_url,
    kfs.article_published_at
  FROM keyword_filtered_stories kfs
  ORDER BY kfs.article_published_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;