-- Phase 1: Fix Story Deduplication + Restore Chronological Order

-- 1. Drop and recreate get_admin_topic_stories with proper deduplication
DROP FUNCTION IF EXISTS get_admin_topic_stories(uuid);

CREATE OR REPLACE FUNCTION public.get_admin_topic_stories(p_topic_id uuid)
RETURNS TABLE(
  id uuid,
  article_id uuid,
  title text,
  summary text,
  author text,
  status text,
  is_published boolean,
  created_at timestamptz,
  updated_at timestamptz,
  slide_count bigint,
  cover_illustration_url text,
  source_format text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (s.id)
    s.id,
    COALESCE(ta.shared_content_id, s.article_id) as article_id,
    COALESCE(sac.title, a.title) as title,
    s.summary,
    COALESCE(sac.author, a.author) as author,
    s.status,
    s.is_published,
    s.created_at,
    s.updated_at,
    COUNT(sl.id) as slide_count,
    s.cover_illustration_url,
    CASE 
      WHEN ta.id IS NOT NULL THEN 'multi_tenant'
      ELSE 'legacy'
    END as source_format
  FROM stories s
  LEFT JOIN topic_articles ta ON s.topic_article_id = ta.id
  LEFT JOIN shared_article_content sac ON ta.shared_content_id = sac.id
  LEFT JOIN articles a ON s.article_id = a.id
  LEFT JOIN slides sl ON s.id = sl.story_id
  WHERE (
    (ta.topic_id = p_topic_id) OR 
    (a.topic_id = p_topic_id AND ta.id IS NULL)
  )
  AND s.status IN ('ready', 'published')
  AND s.is_published = true
  GROUP BY s.id, ta.shared_content_id, ta.id, s.article_id, sac.title, a.title, 
           s.summary, sac.author, a.author, s.status, s.is_published, 
           s.created_at, s.updated_at, s.cover_illustration_url
  ORDER BY s.id, ta.id NULLS LAST;
END;
$$;

-- 2. Drop and recreate get_topic_stories_with_keywords with chronological ordering
DROP FUNCTION IF EXISTS get_topic_stories_with_keywords(uuid, text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_id uuid,
  p_keywords text[] DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  article_id uuid,
  topic_article_id uuid,
  shared_content_id uuid,
  title text,
  summary text,
  status text,
  is_published boolean,
  created_at timestamptz,
  updated_at timestamptz,
  cover_illustration_url text,
  selected_cover_id uuid,
  article jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (s.id)
    s.id,
    s.article_id,
    s.topic_article_id,
    ta.shared_content_id,
    COALESCE(sac.title, a.title) as title,
    s.summary,
    s.status,
    s.is_published,
    s.created_at,
    s.updated_at,
    s.cover_illustration_url,
    s.selected_cover_id,
    jsonb_build_object(
      'id', COALESCE(sac.id, a.id),
      'title', COALESCE(sac.title, a.title),
      'author', COALESCE(sac.author, a.author),
      'published_at', COALESCE(sac.published_at, a.published_at),
      'image_url', COALESCE(sac.image_url, a.image_url),
      'source_url', COALESCE(sac.url, a.source_url)
    ) as article
  FROM stories s
  LEFT JOIN topic_articles ta ON s.topic_article_id = ta.id
  LEFT JOIN shared_article_content sac ON ta.shared_content_id = sac.id
  LEFT JOIN articles a ON s.article_id = a.id
  WHERE (
    (ta.topic_id = p_topic_id) OR
    (a.topic_id = p_topic_id AND ta.id IS NULL)
  )
  AND s.status IN ('ready', 'published')
  AND s.is_published = true
  AND (
    p_keywords IS NULL OR
    p_keywords = ARRAY[]::text[] OR
    (
      -- Multi-tenant keyword matching
      (ta.id IS NOT NULL AND ta.keyword_matches && p_keywords) OR
      -- Legacy keyword matching
      (a.id IS NOT NULL AND a.keywords && p_keywords)
    )
  )
  ORDER BY s.id, COALESCE(sac.published_at, a.published_at) DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 3. Add performance indexes
CREATE INDEX IF NOT EXISTS idx_stories_dedup ON stories(id) INCLUDE (article_id, topic_article_id);
CREATE INDEX IF NOT EXISTS idx_shared_article_content_published_at ON shared_article_content(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC NULLS LAST);

-- Log the migration
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Fixed story deduplication and chronological ordering',
  jsonb_build_object(
    'migration', 'fix_story_deduplication_and_ordering',
    'changes', jsonb_build_array(
      'get_admin_topic_stories: Added DISTINCT ON (s.id)',
      'get_topic_stories_with_keywords: Changed ORDER BY to use published_at',
      'Added performance indexes for deduplication and sorting'
    )
  ),
  'database_migration'
);