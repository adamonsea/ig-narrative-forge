-- Drop existing function to change return type
DROP FUNCTION IF EXISTS get_swipe_insights(uuid);

-- Recreate get_swipe_insights with bottom_stories (most disliked)
CREATE OR REPLACE FUNCTION get_swipe_insights(p_topic_id uuid)
RETURNS TABLE (
  total_readers bigint,
  total_likes bigint,
  total_discards bigint,
  approval_rate numeric,
  top_stories jsonb,
  bottom_stories jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH swipe_data AS (
    SELECT 
      ss.story_id,
      ss.user_id,
      ss.swipe_type
    FROM story_swipes ss
    WHERE ss.topic_id = p_topic_id
  ),
  story_stats AS (
    SELECT 
      sd.story_id,
      s.title,
      COUNT(*) FILTER (WHERE sd.swipe_type = 'like') as likes,
      COUNT(*) FILTER (WHERE sd.swipe_type = 'discard') as dislikes,
      COUNT(*) as total_swipes
    FROM swipe_data sd
    JOIN stories s ON s.id = sd.story_id
    GROUP BY sd.story_id, s.title
  ),
  top_5 AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'story_id', story_id,
        'title', title,
        'likes', likes,
        'dislikes', dislikes
      ) ORDER BY likes DESC, total_swipes DESC
    ) as stories
    FROM (
      SELECT * FROM story_stats 
      WHERE total_swipes > 0
      ORDER BY likes DESC, total_swipes DESC
      LIMIT 5
    ) t
  ),
  bottom_5 AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'story_id', story_id,
        'title', title,
        'likes', likes,
        'dislikes', dislikes
      ) ORDER BY dislikes DESC, likes ASC
    ) as stories
    FROM (
      SELECT * FROM story_stats 
      WHERE dislikes > 0
      ORDER BY dislikes DESC, likes ASC
      LIMIT 5
    ) t
  )
  SELECT 
    (SELECT COUNT(DISTINCT user_id) FROM swipe_data)::bigint as total_readers,
    (SELECT COUNT(*) FILTER (WHERE swipe_type = 'like') FROM swipe_data)::bigint as total_likes,
    (SELECT COUNT(*) FILTER (WHERE swipe_type = 'discard') FROM swipe_data)::bigint as total_discards,
    CASE 
      WHEN (SELECT COUNT(*) FROM swipe_data) > 0 
      THEN ROUND(
        (SELECT COUNT(*) FILTER (WHERE swipe_type = 'like') FROM swipe_data)::numeric / 
        (SELECT COUNT(*) FROM swipe_data)::numeric * 100, 1
      )
      ELSE 0
    END as approval_rate,
    COALESCE((SELECT stories FROM top_5), '[]'::jsonb) as top_stories,
    COALESCE((SELECT stories FROM bottom_5), '[]'::jsonb) as bottom_stories;
END;
$$;

-- Create get_daily_story_counts for NewStoriesSparkline
CREATE OR REPLACE FUNCTION get_daily_story_counts(p_topic_id uuid, p_days integer DEFAULT 7)
RETURNS TABLE (
  date date,
  story_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - (p_days - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::date as date
  ),
  daily_counts AS (
    SELECT 
      s.created_at::date as story_date,
      COUNT(*) as cnt
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    WHERE ta.topic_id = p_topic_id
      AND s.created_at >= (CURRENT_DATE - p_days)
    GROUP BY s.created_at::date
  )
  SELECT 
    ds.date,
    COALESCE(dc.cnt, 0)::bigint as story_count
  FROM date_series ds
  LEFT JOIN daily_counts dc ON dc.story_date = ds.date
  ORDER BY ds.date;
END;
$$;