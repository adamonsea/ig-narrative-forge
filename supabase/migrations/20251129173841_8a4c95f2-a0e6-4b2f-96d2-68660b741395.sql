
-- Drop the old get_topic_visitor_stats function to change return type
DROP FUNCTION IF EXISTS get_topic_visitor_stats(uuid);

-- Recreate with new return type including play mode visitors
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

-- Update record_feed_visit to accept page_type
DROP FUNCTION IF EXISTS record_feed_visit(uuid, text, text, text);

CREATE OR REPLACE FUNCTION record_feed_visit(
  p_topic_id uuid,
  p_visitor_id text,
  p_user_agent text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_page_type text DEFAULT 'feed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO feed_visits (topic_id, visitor_id, user_agent, referrer, visit_date, page_type)
  VALUES (p_topic_id, p_visitor_id, p_user_agent, p_referrer, CURRENT_DATE, p_page_type)
  ON CONFLICT DO NOTHING;
END;
$$;
