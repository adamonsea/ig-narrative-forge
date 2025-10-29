-- Create function to get install stats for topics
-- This counts probable installs: pwa_install_clicked (Android) + pwa_ios_instructions_viewed (iOS) + pwa_installed
CREATE OR REPLACE FUNCTION get_topic_install_stats(p_topic_id uuid)
RETURNS TABLE (
  installs_this_week bigint,
  installs_total bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- This week: clicks + iOS views + confirmed installs
    COUNT(*) FILTER (
      WHERE metric_type IN ('pwa_install_clicked', 'pwa_ios_instructions_viewed', 'pwa_installed')
      AND created_at >= NOW() - INTERVAL '7 days'
    ) as installs_this_week,
    -- Total: clicks + iOS views + confirmed installs
    COUNT(*) FILTER (
      WHERE metric_type IN ('pwa_install_clicked', 'pwa_ios_instructions_viewed', 'pwa_installed')
    ) as installs_total
  FROM topic_engagement_metrics
  WHERE topic_id = p_topic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;