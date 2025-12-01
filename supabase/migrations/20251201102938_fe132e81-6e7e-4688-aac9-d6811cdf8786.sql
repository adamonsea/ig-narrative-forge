-- Drop existing function to allow return type change
DROP FUNCTION IF EXISTS get_topic_engagement_averages(uuid, integer);

-- Recreate with new return type
CREATE OR REPLACE FUNCTION get_topic_engagement_averages(
  p_topic_id uuid,
  p_days integer DEFAULT 7
)
RETURNS TABLE(
  avg_stories_engaged numeric,
  avg_carousel_swipes numeric,
  avg_final_slides_seen numeric,
  total_source_clicks bigint,
  play_mode_visitors_week bigint,
  total_visitors bigint,
  total_stories_engaged bigint,
  total_completed bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_start_date date := CURRENT_DATE - p_days;
  v_avg_engaged numeric := 0;
  v_avg_swipes numeric := 0;
  v_avg_final_slides numeric := 0;
  v_source_clicks bigint := 0;
  v_play_visitors bigint := 0;
  v_total_visitors bigint := 0;
  v_total_engaged bigint := 0;
  v_total_completed bigint := 0;
BEGIN
  -- Avg distinct stories engaged per visitor (unique stories with any interaction)
  SELECT COALESCE(ROUND(AVG(cnt), 1), 0), COALESCE(SUM(cnt), 0)
  INTO v_avg_engaged, v_total_engaged
  FROM (
    SELECT visitor_id, COUNT(DISTINCT story_id) as cnt
    FROM story_interactions
    WHERE topic_id = p_topic_id 
    AND interaction_type = 'swipe'
    AND created_at >= v_start_date
    GROUP BY visitor_id
  ) sub;

  -- Avg carousel swipes per visitor (total swipe events - measures engagement depth)
  SELECT COALESCE(ROUND(AVG(cnt), 1), 0)
  INTO v_avg_swipes
  FROM (
    SELECT visitor_id, COUNT(*) as cnt
    FROM story_interactions
    WHERE topic_id = p_topic_id 
    AND interaction_type = 'swipe'
    AND created_at >= v_start_date
    GROUP BY visitor_id
  ) sub;

  -- Avg final slides seen per visitor (stories read to completion)
  SELECT COALESCE(ROUND(AVG(cnt), 1), 0), COALESCE(SUM(cnt), 0)
  INTO v_avg_final_slides, v_total_completed
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

  -- Total source link clicks
  SELECT COALESCE(COUNT(*), 0)
  INTO v_source_clicks
  FROM story_interactions
  WHERE topic_id = p_topic_id
  AND interaction_type = 'source_click'
  AND created_at >= v_start_date;

  -- Play mode visitors this week
  SELECT COALESCE(COUNT(DISTINCT visitor_id), 0)
  INTO v_play_visitors
  FROM feed_visits
  WHERE topic_id = p_topic_id AND page_type = 'play' AND visit_date >= v_start_date;

  -- Total unique visitors (any interaction)
  SELECT COALESCE(COUNT(DISTINCT visitor_id), 0)
  INTO v_total_visitors
  FROM story_interactions
  WHERE topic_id = p_topic_id
  AND created_at >= v_start_date;

  RETURN QUERY SELECT 
    v_avg_engaged,
    v_avg_swipes,
    v_avg_final_slides,
    v_source_clicks,
    v_play_visitors,
    v_total_visitors,
    v_total_engaged,
    v_total_completed;
END;
$function$;

-- Create RPC to get engagement funnel data
CREATE OR REPLACE FUNCTION get_topic_engagement_funnel(
  p_topic_id uuid,
  p_days integer DEFAULT 7
)
RETURNS TABLE(
  visitors bigint,
  engaged bigint,
  completed bigint,
  shared bigint,
  source_clicks bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_start_date date := CURRENT_DATE - p_days;
  v_visitors bigint := 0;
  v_engaged bigint := 0;
  v_completed bigint := 0;
  v_shared bigint := 0;
  v_source_clicks bigint := 0;
BEGIN
  -- Visitors: unique visitors from feed_visits
  SELECT COALESCE(COUNT(DISTINCT visitor_id), 0)
  INTO v_visitors
  FROM feed_visits
  WHERE topic_id = p_topic_id 
  AND visit_date >= v_start_date
  AND (page_type IS NULL OR page_type = 'feed');

  -- Engaged: unique visitors who swiped at least one slide
  SELECT COALESCE(COUNT(DISTINCT visitor_id), 0)
  INTO v_engaged
  FROM story_interactions
  WHERE topic_id = p_topic_id 
  AND interaction_type = 'swipe'
  AND created_at >= v_start_date;

  -- Completed: unique visitors who reached final slide of any story
  SELECT COALESCE(COUNT(DISTINCT si.visitor_id), 0)
  INTO v_completed
  FROM story_interactions si
  JOIN stories s ON s.id = si.story_id
  JOIN (SELECT story_id, COUNT(*) as slide_count FROM slides GROUP BY story_id) sc ON sc.story_id = s.id
  WHERE si.topic_id = p_topic_id
  AND si.interaction_type = 'swipe'
  AND si.created_at >= v_start_date
  AND si.slide_index >= sc.slide_count - 1;

  -- Shared: unique visitors who clicked share
  SELECT COALESCE(COUNT(DISTINCT visitor_id), 0)
  INTO v_shared
  FROM story_interactions
  WHERE topic_id = p_topic_id 
  AND interaction_type = 'share_click'
  AND created_at >= v_start_date;

  -- Source clicks: unique visitors who clicked source link
  SELECT COALESCE(COUNT(DISTINCT visitor_id), 0)
  INTO v_source_clicks
  FROM story_interactions
  WHERE topic_id = p_topic_id 
  AND interaction_type = 'source_click'
  AND created_at >= v_start_date;

  RETURN QUERY SELECT 
    v_visitors,
    v_engaged,
    v_completed,
    v_shared,
    v_source_clicks;
END;
$function$;