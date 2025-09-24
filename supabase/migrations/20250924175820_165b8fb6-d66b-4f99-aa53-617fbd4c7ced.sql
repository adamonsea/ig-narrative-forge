-- Fix public feed RPC by recreating with correct return type
DROP FUNCTION IF EXISTS public.get_public_topic_feed(text, integer, integer, text);

CREATE OR REPLACE FUNCTION public.get_public_topic_feed(
  p_topic_slug text,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0,
  p_sort_by text DEFAULT 'newest'
)
RETURNS TABLE(
  id uuid,
  title text,
  article_title text,
  article_author text,
  created_at timestamptz,
  updated_at timestamptz,
  cover_illustration_url text,
  cover_illustration_prompt text,
  article_source_url text,
  article_published_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH topic_ids AS (
    SELECT id FROM topics WHERE slug = p_topic_slug
  )
  SELECT 
    s.id,
    s.title,
    COALESCE(sac.title, a.title) AS article_title,
    COALESCE(sac.author, a.author) AS article_author,
    s.created_at,
    s.updated_at,
    s.cover_illustration_url,
    s.cover_illustration_prompt,
    COALESCE(sac.canonical_url, sac.url, a.canonical_url, a.source_url) AS article_source_url,
    COALESCE(sac.published_at, a.published_at) AS article_published_at
  FROM stories s
  LEFT JOIN topic_articles ta ON s.article_id = ta.id
  LEFT JOIN shared_article_content sac ON ta.shared_content_id = sac.id
  LEFT JOIN articles a ON s.article_id = a.id
  WHERE s.is_published = true
    AND s.status IN ('ready','published')
    AND (
      (a.topic_id IN (SELECT id FROM topic_ids))
      OR (ta.topic_id IN (SELECT id FROM topic_ids))
    )
  ORDER BY 
    CASE WHEN lower(p_sort_by) = 'oldest' THEN s.created_at END ASC,
    CASE WHEN lower(p_sort_by) <> 'oldest' THEN s.created_at END DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_topic_feed(p_topic_slug text, p_limit integer, p_offset integer, p_sort_by text) TO anon, authenticated;
