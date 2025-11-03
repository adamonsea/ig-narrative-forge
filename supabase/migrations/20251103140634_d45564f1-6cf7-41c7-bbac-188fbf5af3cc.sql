-- Recreate get_admin_topic_stories with full admin pipeline schema + animation fields
DROP FUNCTION IF EXISTS public.get_admin_topic_stories(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_admin_topic_stories(
  p_topic_id uuid,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  title text,
  status text,
  is_published boolean,
  created_at timestamptz,
  updated_at timestamptz,
  article_id uuid,
  topic_article_id uuid,
  shared_content_id uuid,
  article_title text,
  article_url text,
  article_author text,
  article_published_at timestamptz,
  slide_count bigint,
  story_type text,
  cover_illustration_url text,
  cover_illustration_prompt text,
  illustration_generated_at timestamptz,
  animated_illustration_url text,
  slide_type text,
  tone text,
  writing_style text,
  audience_expertise text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  (
    -- Legacy stories
    SELECT 
      s.id,
      s.title,
      s.status,
      s.is_published,
      s.created_at,
      s.updated_at,
      s.article_id,
      NULL::uuid as topic_article_id,
      NULL::uuid as shared_content_id,
      a.title as article_title,
      a.source_url as article_url,
      a.author as article_author,
      a.published_at as article_published_at,
      COALESCE((SELECT count(*) FROM slides WHERE story_id = s.id), 0) as slide_count,
      'legacy'::text as story_type,
      s.cover_illustration_url,
      s.cover_illustration_prompt,
      s.illustration_generated_at,
      s.animated_illustration_url,
      s.slide_type,
      s.tone,
      s.writing_style,
      s.audience_expertise
    FROM stories s
    JOIN articles a ON a.id = s.article_id
    WHERE a.topic_id = p_topic_id
      AND (p_status IS NULL OR s.status = p_status)
      AND s.article_id IS NOT NULL
  )
  UNION ALL
  (
    -- Multi-tenant stories
    SELECT 
      s.id,
      s.title,
      s.status,
      s.is_published,
      s.created_at,
      s.updated_at,
      NULL::uuid as article_id,
      s.topic_article_id,
      ta.shared_content_id,
      sac.title as article_title,
      sac.url as article_url,
      sac.author as article_author,
      sac.published_at as article_published_at,
      COALESCE((SELECT count(*) FROM slides WHERE story_id = s.id), 0) as slide_count,
      'multi_tenant'::text as story_type,
      s.cover_illustration_url,
      s.cover_illustration_prompt,
      s.illustration_generated_at,
      s.animated_illustration_url,
      s.slide_type,
      s.tone,
      s.writing_style,
      s.audience_expertise
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    WHERE ta.topic_id = p_topic_id
      AND (p_status IS NULL OR s.status = p_status)
      AND s.topic_article_id IS NOT NULL
  )
  ORDER BY created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;