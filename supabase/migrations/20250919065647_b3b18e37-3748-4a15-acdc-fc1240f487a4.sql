-- Fix the get_topic_stories function to remove invalid column references
CREATE OR REPLACE FUNCTION public.get_topic_stories(
  p_topic_id uuid,
  p_sort_order text DEFAULT 'newest',
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  title text,
  author text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  article_id uuid,
  topic_article_id uuid,
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
  -- Return stories from both legacy articles and multi-tenant topic_articles for the given topic_id
  RETURN QUERY
  SELECT 
    s.id,
    s.title,
    s.author,
    s.created_at,
    s.updated_at,
    s.article_id,
    s.topic_article_id,
    COALESCE(a.title, sac.title) as article_title,
    COALESCE(a.author, sac.author) as article_author,
    COALESCE(a.published_at, sac.published_at) as article_published_at,
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
  LEFT JOIN articles a ON a.id = s.article_id AND a.topic_id = p_topic_id
  LEFT JOIN topic_articles ta ON ta.id = s.topic_article_id AND ta.topic_id = p_topic_id
  LEFT JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  LEFT JOIN slides sl ON sl.story_id = s.id
  WHERE (a.topic_id = p_topic_id OR ta.topic_id = p_topic_id)
    AND s.is_published = true
    AND s.status IN ('ready', 'published')
  GROUP BY s.id, s.title, s.author, s.created_at, s.updated_at, s.article_id, s.topic_article_id,
           a.title, a.author, a.published_at, sac.title, sac.author, sac.published_at
  ORDER BY 
    CASE 
      WHEN p_sort_order = 'oldest' THEN s.created_at
      ELSE s.created_at
    END DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;