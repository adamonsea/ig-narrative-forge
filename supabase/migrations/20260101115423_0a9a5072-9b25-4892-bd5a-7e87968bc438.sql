-- Fix get_swipe_mode_stories ambiguity (RETURNS TABLE columns become PL/pgSQL variables)
-- Use distinct aliases inside CTEs to avoid name collisions

CREATE OR REPLACE FUNCTION public.get_swipe_mode_stories(
  p_topic_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  story_id uuid,
  title text,
  author text,
  cover_illustration_url text,
  created_at timestamp with time zone,
  source_url text,
  published_at timestamp with time zone,
  slides jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH swiped_stories AS (
    SELECT ss.story_id as sid
    FROM story_swipes ss
    WHERE p_user_id IS NOT NULL
      AND ss.user_id = p_user_id
      AND ss.topic_id = p_topic_id
  ),
  eligible_stories AS (
    SELECT 
      s.id,
      s.title,
      s.author,
      s.cover_illustration_url,
      s.created_at,
      sac.url as source_url,
      sac.published_at
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    LEFT JOIN shared_article_content sac ON sac.id = s.shared_content_id
    WHERE ta.topic_id = p_topic_id
      AND s.status = 'published'
      AND s.cover_illustration_url IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM swiped_stories sw WHERE sw.sid = s.id
      )
    ORDER BY s.created_at DESC
    LIMIT p_limit
  ),
  story_slides AS (
    SELECT 
      sl.story_id,
      jsonb_agg(
        jsonb_build_object(
          'slide_number', sl.slide_number,
          'content', sl.content
        ) ORDER BY sl.slide_number
      ) as slides_json
    FROM slides sl
    WHERE sl.story_id IN (SELECT es.id FROM eligible_stories es)
    GROUP BY sl.story_id
  )
  SELECT 
    es.id as story_id,
    es.title,
    es.author,
    es.cover_illustration_url,
    es.created_at,
    es.source_url,
    es.published_at,
    ss.slides_json as slides
  FROM eligible_stories es
  JOIN story_slides ss ON ss.story_id = es.id;
END;
$$;