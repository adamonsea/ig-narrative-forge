-- Fix the get_stories_unified RPC function to handle the slides table properly
DROP FUNCTION IF EXISTS public.get_stories_unified(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_stories_unified(
  p_topic_id uuid, 
  p_status text DEFAULT NULL, 
  p_limit integer DEFAULT 50, 
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  article_id uuid,
  topic_article_id uuid,
  shared_content_id uuid,
  title text,
  status text,
  publication_name text,
  author text,
  is_published boolean,
  quality_score integer,
  cover_illustration_url text,
  cover_illustration_prompt text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  slides jsonb,
  source_url text,
  word_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.article_id,
    s.topic_article_id,
    s.shared_content_id,
    s.title,
    s.status,
    s.publication_name,
    s.author,
    s.is_published,
    s.quality_score,
    s.cover_illustration_url,
    s.cover_illustration_prompt,
    s.created_at,
    s.updated_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', sl.id,
            'slide_number', sl.slide_number,
            'content', sl.content,
            'word_count', sl.word_count,
            'image_url', sl.image_url,
            'alt_text', sl.alt_text
          ) ORDER BY sl.slide_number
        )
        FROM slides sl
        WHERE sl.story_id = s.id
      ),
      '[]'::jsonb
    ) as slides,
    COALESCE(sac.url, a.source_url) as source_url,
    COALESCE(sac.word_count, a.word_count) as word_count
  FROM stories s
  LEFT JOIN articles a ON a.id = s.article_id
  LEFT JOIN shared_article_content sac ON sac.id = s.shared_content_id
  LEFT JOIN topic_articles ta ON ta.id = s.topic_article_id
  WHERE (s.article_id IN (
    SELECT id FROM articles WHERE topic_id = p_topic_id
  ) OR ta.topic_id = p_topic_id)
    AND (p_status IS NULL OR s.status = p_status)
  ORDER BY s.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;