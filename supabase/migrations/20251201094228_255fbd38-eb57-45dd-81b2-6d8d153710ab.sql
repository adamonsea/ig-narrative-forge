
-- Fix get_topic_engagement_averages to use story_interactions for scrolled metric
-- The story_impressions table has no data because the tracking hook was silently failing
-- story_interactions has 190+ swipe records and is the reliable source

CREATE OR REPLACE FUNCTION get_topic_engagement_averages(
  p_topic_id uuid,
  p_days integer DEFAULT 7
)
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
AS $function$
DECLARE
  v_start_date date := CURRENT_DATE - p_days;
  v_avg_scrolled numeric := 0;
  v_avg_play_swiped numeric := 0;
  v_avg_feed_swiped numeric := 0;
  v_avg_final_slides numeric := 0;
  v_play_visitors bigint := 0;
  v_total_scrollers bigint := 0;
  v_total_swipers bigint := 0;
BEGIN
  -- Avg stories scrolled per visitor - now using story_interactions instead of broken story_impressions
  -- This counts unique stories where user interacted (swiped at least once)
  SELECT COALESCE(ROUND(AVG(cnt), 1), 0), COALESCE(COUNT(*), 0)
  INTO v_avg_scrolled, v_total_scrollers
  FROM (
    SELECT visitor_id, COUNT(DISTINCT story_id) as cnt
    FROM story_interactions
    WHERE topic_id = p_topic_id 
    AND interaction_type = 'swipe'
    AND created_at >= v_start_date
    GROUP BY visitor_id
  ) sub;

  -- Avg Play Mode swipes per user
  SELECT COALESCE(ROUND(AVG(cnt), 1), 0), COALESCE(COUNT(*), 0)
  INTO v_avg_play_swiped, v_total_swipers
  FROM (
    SELECT user_id, COUNT(*) as cnt
    FROM story_swipes
    WHERE topic_id = p_topic_id AND created_at >= v_start_date
    GROUP BY user_id
  ) sub;

  -- Avg Feed swipes (carousel) per visitor - same as scrolled now
  v_avg_feed_swiped := v_avg_scrolled;

  -- Avg final slides seen per visitor
  SELECT COALESCE(ROUND(AVG(cnt), 1), 0)
  INTO v_avg_final_slides
  FROM (
    SELECT si.visitor_id, COUNT(DISTINCT si.story_id) as cnt
    FROM story_interactions si
    JOIN stories s ON s.id = si.story_id
    JOIN (SELECT story_id, COUNT(*) as slide_count FROM slides GROUP BY story_id) sc ON sc.story_id = s.id
    WHERE si.topic_id = p_topic_id
    AND si.interaction_type = 'swipe'
    AND si.created_at >= v_start_date
    AND si.slide_index >= sc.slide_count - 1
    GROUP BY si.visitor_id
  ) sub;

  -- Play mode visitors this week
  SELECT COALESCE(COUNT(DISTINCT visitor_id), 0)
  INTO v_play_visitors
  FROM feed_visits
  WHERE topic_id = p_topic_id AND page_type = 'play' AND visit_date >= v_start_date;

  RETURN QUERY SELECT 
    v_avg_scrolled,
    v_avg_play_swiped,
    v_avg_feed_swiped,
    v_avg_final_slides,
    v_play_visitors,
    v_total_scrollers,
    v_total_swipers;
END;
$function$;
