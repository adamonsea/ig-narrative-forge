
-- Add the missing page_type column to feed_visits
ALTER TABLE feed_visits ADD COLUMN IF NOT EXISTS page_type text DEFAULT 'feed';

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_feed_visits_page_type ON feed_visits(topic_id, page_type, visit_date);

-- Recreate get_topic_visitor_stats with backward compatible logic
CREATE OR REPLACE FUNCTION get_topic_visitor_stats(p_topic_id uuid)
RETURNS TABLE(
  visits_today bigint,
  visits_this_week bigint,
  play_mode_visits_week bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE((
      SELECT COUNT(DISTINCT visitor_id)
      FROM feed_visits
      WHERE topic_id = p_topic_id
      AND visit_date = CURRENT_DATE
      AND (page_type = 'feed' OR page_type IS NULL)
    ), 0)::bigint as visits_today,
    COALESCE((
      SELECT COUNT(DISTINCT visitor_id)
      FROM feed_visits
      WHERE topic_id = p_topic_id
      AND visit_date >= CURRENT_DATE - 7
      AND (page_type = 'feed' OR page_type IS NULL)
    ), 0)::bigint as visits_this_week,
    COALESCE((
      SELECT COUNT(DISTINCT visitor_id)
      FROM feed_visits
      WHERE topic_id = p_topic_id
      AND visit_date >= CURRENT_DATE - 7
      AND page_type = 'play'
    ), 0)::bigint as play_mode_visits_week;
END;
$$;
