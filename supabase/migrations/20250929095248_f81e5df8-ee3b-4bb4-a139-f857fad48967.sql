-- Create function to get popular stories by time period
CREATE OR REPLACE FUNCTION public.get_popular_stories_by_period(p_topic_id uuid)
RETURNS TABLE(
  story_id uuid, 
  period_type text, 
  swipe_count bigint,
  rank_position integer
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH story_swipes AS (
    SELECT 
      si.story_id,
      COUNT(*) as swipe_count,
      CASE 
        WHEN si.created_at::date = CURRENT_DATE THEN 'today'
        WHEN si.created_at::date = CURRENT_DATE - INTERVAL '1 day' THEN 'yesterday'
        WHEN si.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 'this_week'
        ELSE 'older'
      END as period_type
    FROM story_interactions si
    WHERE si.topic_id = p_topic_id
      AND si.interaction_type = 'swipe'
      AND si.created_at >= CURRENT_DATE - INTERVAL '30 days' -- Only look at last 30 days
    GROUP BY si.story_id, period_type
  ),
  ranked_stories AS (
    SELECT 
      ss.story_id,
      ss.period_type,
      ss.swipe_count,
      ROW_NUMBER() OVER (PARTITION BY ss.period_type ORDER BY ss.swipe_count DESC) as rank_position
    FROM story_swipes ss
  )
  SELECT 
    rs.story_id,
    rs.period_type,
    rs.swipe_count,
    rs.rank_position::integer
  FROM ranked_stories rs
  WHERE 
    (rs.period_type = 'today' AND rs.rank_position <= 2) OR
    (rs.period_type = 'yesterday' AND rs.rank_position <= 1) OR
    (rs.period_type = 'this_week' AND rs.rank_position <= 2) OR
    (rs.period_type = 'older' AND rs.rank_position <= 2);
END;
$$;