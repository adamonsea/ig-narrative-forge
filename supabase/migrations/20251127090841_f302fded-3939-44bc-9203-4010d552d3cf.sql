-- Create function to get topic registrant stats (users who used game mode)
CREATE OR REPLACE FUNCTION get_topic_registrant_stats(p_topic_id uuid)
RETURNS TABLE (
  registrants_this_week bigint,
  registrants_total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT CASE 
      WHEN ss.created_at >= NOW() - INTERVAL '7 days' THEN ss.user_id 
    END) as registrants_this_week,
    COUNT(DISTINCT ss.user_id) as registrants_total
  FROM story_swipes ss
  WHERE ss.topic_id = p_topic_id;
END;
$$;