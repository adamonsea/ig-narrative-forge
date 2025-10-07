-- Fix slide ordering in get_topic_stories_with_keywords RPC function
DROP FUNCTION IF EXISTS get_topic_stories_with_keywords(text, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION get_topic_stories_with_keywords(
  p_topic_slug text,
  p_keywords text[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  story_id uuid,
  story_title text,
  story_status text,
  story_is_published boolean,
  story_created_at timestamp with time zone,
  story_cover_url text,
  article_id uuid,
  article_source_url text,
  article_published_at timestamp with time zone,
  slide_id uuid,
  slide_number integer,
  slide_content text,
  content_type text,
  shared_content_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH topic_info AS (
    SELECT t.id as topic_id FROM topics t WHERE t.slug = p_topic_slug
  ),
  -- Get all published stories for this topic (legacy path)
  legacy_stories AS (
    SELECT DISTINCT
      s.id as story_id,
      s.title as story_title,
      s.status as story_status,
      s.is_published as story_is_published,
      s.created_at as story_created_at,
      s.cover_illustration_url as story_cover_url,
      a.id as article_id,
      a.source_url as article_source_url,
      a.published_at as article_published_at,
      sl.id as slide_id,
      sl.slide_number as slide_number,
      sl.content as slide_content,
      'legacy'::text as content_type,
      NULL::uuid as shared_content_id
    FROM stories s
    JOIN articles a ON a.id = s.article_id
    LEFT JOIN slides sl ON sl.story_id = s.id
    WHERE a.topic_id = (SELECT topic_id FROM topic_info)
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
      AND (p_keywords IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_keywords) kw 
        WHERE sl.content ILIKE '%' || kw || '%'
      ))
      AND (p_sources IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_sources) src
        WHERE a.source_url ILIKE '%' || src || '%'
      ))
  ),
  -- Get all published stories for this topic (multi-tenant path)
  multitenant_stories AS (
    SELECT DISTINCT
      s.id as story_id,
      s.title as story_title,
      s.status as story_status,
      s.is_published as story_is_published,
      s.created_at as story_created_at,
      s.cover_illustration_url as story_cover_url,
      NULL::uuid as article_id,
      sac.url as article_source_url,
      sac.published_at as article_published_at,
      sl.id as slide_id,
      sl.slide_number as slide_number,
      sl.content as slide_content,
      'multitenant'::text as content_type,
      sac.id as shared_content_id
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    LEFT JOIN slides sl ON sl.story_id = s.id
    WHERE ta.topic_id = (SELECT topic_id FROM topic_info)
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
      AND (p_keywords IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_keywords) kw 
        WHERE sl.content ILIKE '%' || kw || '%'
      ))
      AND (p_sources IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_sources) src
        WHERE sac.url ILIKE '%' || src || '%'
      ))
  ),
  -- Combine both paths
  all_stories AS (
    SELECT * FROM legacy_stories
    UNION ALL
    SELECT * FROM multitenant_stories
  )
  -- Return paginated results with slides ordered correctly
  SELECT * FROM all_stories
  ORDER BY article_published_at DESC NULLS LAST, slide_number ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Add index to optimize slide ordering queries
CREATE INDEX IF NOT EXISTS idx_slides_story_slide_number 
ON slides(story_id, slide_number);

-- Log the migration
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Fixed slide ordering bug - added slide_number to ORDER BY and created optimization index',
  jsonb_build_object(
    'changes', jsonb_build_array(
      'Updated get_topic_stories_with_keywords ORDER BY to include slide_number ASC',
      'Created idx_slides_story_slide_number index on slides(story_id, slide_number)',
      'Added defensive sorting and validation in frontend hooks and components'
    ),
    'index_name', 'idx_slides_story_slide_number'
  ),
  'database_migration'
);