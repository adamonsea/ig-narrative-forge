-- Drop and recreate get_public_topic_feed function to fix invalid column references

DROP FUNCTION IF EXISTS public.get_public_topic_feed(text,integer,integer,text);

CREATE OR REPLACE FUNCTION public.get_public_topic_feed(
  topic_slug_param text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_sort_by text DEFAULT 'newest'
)
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
  slides jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.article_id,
    COALESCE(sac.title, a.title) as title,
    s.summary,
    COALESCE(sac.author, a.author) as author,
    s.status,
    s.is_published,
    s.created_at,
    s.updated_at,
    COUNT(DISTINCT sl.id) as slide_count,
    s.cover_illustration_url,
    COALESCE(
      jsonb_agg(
        DISTINCT jsonb_build_object(
          'id', sl.id,
          'slide_number', sl.slide_number,
          'content', sl.content,
          'word_count', sl.word_count,
          'alt_text', sl.alt_text,
          'image_url', v.image_url
        ) ORDER BY sl.slide_number
      ) FILTER (WHERE sl.id IS NOT NULL),
      '[]'::jsonb
    ) as slides
  FROM stories s
  LEFT JOIN topic_articles ta ON s.article_id = ta.id
  LEFT JOIN shared_article_content sac ON ta.shared_content_id = sac.id
  LEFT JOIN articles a ON s.article_id = a.id
  LEFT JOIN slides sl ON s.id = sl.story_id
  LEFT JOIN visuals v ON sl.id = v.slide_id
  WHERE (
    (ta.topic_id IN (
      SELECT t.id FROM topics t 
      WHERE t.slug = topic_slug_param 
        AND t.is_public = true 
        AND t.is_active = true
    )) OR 
    (a.topic_id IN (
      SELECT t.id FROM topics t 
      WHERE t.slug = topic_slug_param 
        AND t.is_public = true 
        AND t.is_active = true
    ))
  )
  AND s.status IN ('ready', 'published')
  AND s.is_published = true
  GROUP BY s.id, s.article_id, sac.title, a.title, s.summary, sac.author, a.author, 
           s.status, s.is_published, s.created_at, s.updated_at, s.cover_illustration_url
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_public_topic_feed(topic_slug_param text, p_limit integer, p_offset integer, p_sort_by text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_topic_feed(topic_slug_param text, p_limit integer, p_offset integer, p_sort_by text) TO authenticated;