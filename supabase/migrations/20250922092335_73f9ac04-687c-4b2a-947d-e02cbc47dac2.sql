-- Fix the get_unified_topic_stories function to use correct column mapping
CREATE OR REPLACE FUNCTION public.get_unified_topic_stories(
  p_topic_id uuid,
  p_status text DEFAULT 'published',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  title text,
  status text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  is_published boolean,
  article_id uuid,
  topic_article_id uuid,
  shared_content_id uuid,
  article_title text,
  article_body text,
  article_source_url text,
  article_published_at timestamp with time zone,
  article_author text,
  slide_count bigint,
  story_type text,
  headline text,
  summary text,
  cover_illustration_url text,
  illustration_generated_at timestamp with time zone,
  slidetype text,
  tone text,
  writing_style text,
  audience_expertise text,
  is_teaser boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.title,
    s.status,
    s.created_at,
    s.updated_at,
    s.is_published,
    s.article_id,
    s.topic_article_id,
    s.shared_content_id,
    -- Get article details from both legacy and multi-tenant sources
    COALESCE(
      a.title, 
      sac.title
    ) as article_title,
    COALESCE(
      a.body,
      sac.body
    ) as article_body,
    COALESCE(
      a.source_url,
      sac.url
    ) as article_source_url,
    COALESCE(
      a.published_at,
      sac.published_at
    ) as article_published_at,
    COALESCE(
      a.author,
      sac.author
    ) as article_author,
    (
      SELECT COUNT(*)
      FROM slides sl
      WHERE sl.story_id = s.id
    ) as slide_count,
    CASE 
      WHEN s.article_id IS NOT NULL THEN 'legacy'
      ELSE 'multi_tenant'
    END as story_type,
    s.title as headline,
    s.summary,
    s.cover_illustration_url,
    s.illustration_generated_at,
    s.slidetype,
    s.tone,
    s.writing_style,
    s.audience_expertise,
    s.is_teaser
  FROM stories s
  LEFT JOIN articles a ON s.article_id = a.id
  LEFT JOIN topic_articles ta ON s.topic_article_id = ta.id
  LEFT JOIN shared_article_content sac ON s.shared_content_id = sac.id OR ta.shared_content_id = sac.id
  WHERE 
    (a.topic_id = p_topic_id OR ta.topic_id = p_topic_id)
    AND s.is_published = true
    AND s.status IN ('ready', 'published')
    AND (p_status IS NULL OR s.status = p_status)
  ORDER BY s.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;