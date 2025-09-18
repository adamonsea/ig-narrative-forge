-- Create or replace the get_topic_stories function with correct column references
CREATE OR REPLACE FUNCTION public.get_topic_stories(
  p_topic_slug text,
  p_sort_by text DEFAULT 'newest',
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  title text,
  author text,
  published_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  article_id uuid,
  article_title text,
  article_author text,
  article_published_at timestamp with time zone,
  slides jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Get stories for the given topic slug, ordered by the specified sort option
  RETURN QUERY
  SELECT 
    s.id,
    s.title,  -- Fixed: was s.headline, now s.title
    s.author,
    s.published_at,
    s.created_at,
    s.updated_at,
    a.id as article_id,
    a.title as article_title,
    a.author as article_author,
    a.published_at as article_published_at,
    COALESCE(
      json_agg(
        json_build_object(
          'id', sl.id,
          'slide_number', sl.slide_number,
          'content', sl.content,
          'word_count', sl.word_count,
          'type', sl.type,
          'image_url', sl.image_url,
          'alt_text', sl.alt_text
        )
        ORDER BY sl.slide_number
      ) FILTER (WHERE sl.id IS NOT NULL),
      '[]'::json
    )::jsonb as slides
  FROM stories s
  JOIN articles a ON a.id = s.article_id
  JOIN topics t ON t.id = a.topic_id
  LEFT JOIN slides sl ON sl.story_id = s.id
  WHERE t.slug = p_topic_slug
    AND s.is_published = true
    AND s.status IN ('ready', 'published')
  GROUP BY s.id, s.title, s.author, s.published_at, s.created_at, s.updated_at,
           a.id, a.title, a.author, a.published_at
  ORDER BY 
    CASE 
      WHEN p_sort_by = 'newest' THEN s.created_at
      WHEN p_sort_by = 'oldest' THEN s.created_at
      ELSE s.created_at
    END DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;