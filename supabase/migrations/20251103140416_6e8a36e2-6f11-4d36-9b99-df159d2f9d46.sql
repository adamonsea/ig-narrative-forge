-- Fix get_admin_topic_stories to restore original filtering logic

DROP FUNCTION IF EXISTS public.get_admin_topic_stories(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_admin_topic_stories(
  p_topic_id uuid,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
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
  cover_illustration_prompt text,
  illustration_generated_at timestamptz,
  animated_illustration_url text,
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
    s.cover_illustration_prompt,
    s.illustration_generated_at,
    s.animated_illustration_url,
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
           s.created_at, s.updated_at, s.cover_illustration_url, 
           s.cover_illustration_prompt, s.illustration_generated_at, s.animated_illustration_url
  ORDER BY s.id, ta.id NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;