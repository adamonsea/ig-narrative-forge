
-- Update engagement averages RPC to include feed swipe metrics
DROP FUNCTION IF EXISTS get_topic_engagement_averages(uuid, int);

CREATE OR REPLACE FUNCTION get_topic_engagement_averages(p_topic_id uuid, p_days int DEFAULT 7)
RETURNS TABLE(
  avg_stories_scrolled numeric,
  avg_stories_swiped numeric,
  avg_feed_stories_swiped numeric,
  avg_final_slides_seen numeric,
  play_mode_visitors_week bigint,
  total_scrollers bigint,
  total_swipers bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date date := CURRENT_DATE - p_days;
BEGIN
  RETURN QUERY
  WITH scroll_stats AS (
    -- Story impressions (stories scrolled past in feed)
    SELECT 
      visitor_id,
      COUNT(DISTINCT story_id) as stories_scrolled
    FROM story_impressions
    WHERE topic_id = p_topic_id
    AND impression_date >= v_start_date
    GROUP BY visitor_id
  ),
  play_swipe_stats AS (
    -- Play Mode swipes (like/discard in swipe mode)
    SELECT 
      user_id::text as visitor_id,
      COUNT(*) as stories_swiped
    FROM story_swipes
    WHERE topic_id = p_topic_id
    AND created_at >= v_start_date
    GROUP BY user_id
  ),
  feed_swipe_stats AS (
    -- Feed Mode swipes (carousel slide swipes)
    SELECT 
      visitor_id,
      COUNT(DISTINCT story_id) as stories_swiped
    FROM story_interactions
    WHERE topic_id = p_topic_id
    AND interaction_type = 'swipe'
    AND created_at >= v_start_date
    GROUP BY visitor_id
  ),
  final_slide_stats AS (
    -- Final slides seen (swipes where slide_index equals max slides for that story)
    SELECT 
      si.visitor_id,
      COUNT(DISTINCT si.story_id) as final_slides_seen
    FROM story_interactions si
    JOIN stories s ON s.id = si.story_id
    WHERE si.topic_id = p_topic_id
    AND si.interaction_type = 'swipe'
    AND si.created_at >= v_start_date
    AND si.slide_index >= (
      SELECT COUNT(*) FROM slides sl WHERE sl.story_id = s.id
    ) - 1
    GROUP BY si.visitor_id
  ),
  play_mode_visitors AS (
    SELECT COUNT(DISTINCT visitor_id) as visitors
    FROM feed_visits
    WHERE topic_id = p_topic_id
    AND page_type = 'play'
    AND visit_date >= v_start_date
  )
  SELECT 
    COALESCE(ROUND(AVG(scroll_stats.stories_scrolled), 1), 0)::numeric as avg_stories_scrolled,
    COALESCE(ROUND(AVG(play_swipe_stats.stories_swiped), 1), 0)::numeric as avg_stories_swiped,
    COALESCE(ROUND(AVG(feed_swipe_stats.stories_swiped), 1), 0)::numeric as avg_feed_stories_swiped,
    COALESCE(ROUND(AVG(final_slide_stats.final_slides_seen), 1), 0)::numeric as avg_final_slides_seen,
    COALESCE((SELECT visitors FROM play_mode_visitors), 0)::bigint as play_mode_visitors_week,
    COALESCE((SELECT COUNT(*) FROM scroll_stats), 0)::bigint as total_scrollers,
    COALESCE((SELECT COUNT(*) FROM play_swipe_stats), 0)::bigint as total_swipers;
END;
$$;
