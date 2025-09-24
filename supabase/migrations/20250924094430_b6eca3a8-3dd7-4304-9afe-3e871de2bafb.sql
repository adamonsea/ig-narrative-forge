-- Drop and recreate get_admin_topic_stories function with deduplication
DROP FUNCTION IF EXISTS public.get_admin_topic_stories(uuid);

CREATE OR REPLACE FUNCTION public.get_admin_topic_stories(p_topic_id uuid)
RETURNS TABLE(
  id uuid,
  article_id uuid,
  title text,
  summary text,
  author text,
  status text,
  is_published boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
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
  WITH deduplicated_stories AS (
    -- Multi-tenant stories (prioritized)
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
      'multi_tenant' as source_format
    FROM stories s
    LEFT JOIN topic_articles ta ON s.article_id = ta.id
    LEFT JOIN shared_article_content sac ON ta.shared_content_id = sac.id
    LEFT JOIN articles a ON s.article_id = a.id
    LEFT JOIN slides sl ON s.id = sl.story_id
    WHERE (
      (ta.topic_id = p_topic_id) OR 
      (a.topic_id = p_topic_id AND ta.id IS NULL)
    )
    AND s.status IN ('ready', 'published')
    AND s.is_published = true
    GROUP BY s.id, ta.shared_content_id, s.article_id, sac.title, a.title, 
             s.summary, sac.author, a.author, s.status, s.is_published, 
             s.created_at, s.updated_at, s.cover_illustration_url
    
    UNION
    
    -- Legacy stories (only if not already covered by multi-tenant)
    SELECT DISTINCT ON (s.id)
      s.id,
      s.article_id,
      a.title,
      s.summary,
      a.author,
      s.status,
      s.is_published,
      s.created_at,
      s.updated_at,
      COUNT(sl.id) as slide_count,
      s.cover_illustration_url,
      'legacy' as source_format
    FROM stories s
    JOIN articles a ON s.article_id = a.id
    LEFT JOIN slides sl ON s.id = sl.story_id
    WHERE a.topic_id = p_topic_id
    AND s.status IN ('ready', 'published')
    AND s.is_published = true
    -- Exclude stories that exist in multi-tenant format
    AND NOT EXISTS (
      SELECT 1 FROM topic_articles ta 
      WHERE ta.id = s.article_id
    )
    GROUP BY s.id, s.article_id, a.title, s.summary, a.author, 
             s.status, s.is_published, s.created_at, s.updated_at, s.cover_illustration_url
  )
  SELECT 
    ds.id,
    ds.article_id,
    ds.title,
    ds.summary,
    ds.author,
    ds.status,
    ds.is_published,
    ds.created_at,
    ds.updated_at,
    ds.slide_count,
    ds.cover_illustration_url,
    ds.source_format
  FROM deduplicated_stories ds
  ORDER BY ds.created_at DESC;
END;
$$;