-- Drop and recreate the function with corrected signature
DROP FUNCTION IF EXISTS public.get_public_topic_feed(text, integer, integer, text);

-- Create a public feed function returning only published stories for a public topic
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
  article_source_url text,
  article_published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  cover_illustration_url text,
  cover_illustration_prompt text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH topic_row AS (
    SELECT id FROM public.topics 
    WHERE slug = p_topic_slug 
      AND is_public = true 
      AND is_active = true
    LIMIT 1
  ), dedup AS (
    -- Multi-tenant stories (prioritized)
    SELECT DISTINCT ON (s.id)
      s.id,
      s.title AS title,
      sac.title AS article_title,
      sac.author AS article_author,
      sac.url AS article_source_url,
      sac.published_at AS article_published_at,
      s.created_at,
      s.updated_at,
      s.cover_illustration_url,
      s.cover_illustration_prompt
    FROM public.stories s
    LEFT JOIN public.topic_articles ta ON s.article_id = ta.id
    LEFT JOIN public.shared_article_content sac ON ta.shared_content_id = sac.id
    WHERE ta.topic_id = (SELECT id FROM topic_row)
      AND s.is_published = true
      AND s.status IN ('ready','published')

    UNION

    -- Legacy stories (only if not already covered by multi-tenant)
    SELECT DISTINCT ON (s.id)
      s.id,
      s.title AS title,
      a.title AS article_title,
      a.author AS article_author,
      a.source_url AS article_source_url,
      a.published_at AS article_published_at,
      s.created_at,
      s.updated_at,
      s.cover_illustration_url,
      s.cover_illustration_prompt
    FROM public.stories s
    JOIN public.articles a ON s.article_id = a.id
    WHERE a.topic_id = (SELECT id FROM topic_row)
      AND s.is_published = true
      AND s.status IN ('ready','published')
      AND NOT EXISTS (
        SELECT 1 
        FROM public.topic_articles ta2 
        WHERE ta2.id = s.article_id
      )
  )
  SELECT *
  FROM dedup
  ORDER BY 
    CASE WHEN p_sort_by = 'oldest' THEN created_at END ASC,
    CASE WHEN p_sort_by <> 'oldest' THEN created_at END DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Allow anonymous and authenticated roles to execute the public feed function
GRANT EXECUTE ON FUNCTION public.get_public_topic_feed(p_topic_slug text, p_limit integer, p_offset integer, p_sort_by text) TO anon, authenticated;