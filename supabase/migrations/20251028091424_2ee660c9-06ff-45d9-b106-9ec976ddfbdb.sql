-- Create function to get simplified source statistics for topic
CREATE OR REPLACE FUNCTION get_topic_source_stats(p_topic_id uuid)
RETURNS TABLE (
  source_id uuid,
  source_name text,
  feed_url text,
  canonical_domain text,
  is_active boolean,
  is_gathering boolean,
  stories_published_7d bigint,
  stories_published_total bigint,
  last_story_date timestamptz
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id as source_id,
    cs.source_name,
    cs.feed_url,
    cs.canonical_domain,
    COALESCE(ts.is_active, false) as is_active,
    EXISTS(
      SELECT 1 
      FROM scrape_jobs sj 
      WHERE sj.source_id = cs.id 
      AND sj.status = 'running'
      AND sj.created_at > NOW() - INTERVAL '5 minutes'
    ) as is_gathering,
    (
      SELECT COUNT(*)::bigint
      FROM stories s
      WHERE s.topic_id = p_topic_id
      AND s.source_id = cs.id
      AND s.is_published = true
      AND s.created_at >= NOW() - INTERVAL '7 days'
    ) as stories_published_7d,
    (
      SELECT COUNT(*)::bigint
      FROM stories s
      WHERE s.topic_id = p_topic_id
      AND s.source_id = cs.id
      AND s.is_published = true
    ) as stories_published_total,
    (
      SELECT MAX(s.created_at)
      FROM stories s
      WHERE s.topic_id = p_topic_id
      AND s.source_id = cs.id
      AND s.is_published = true
    ) as last_story_date
  FROM content_sources cs
  JOIN topic_sources ts ON ts.source_id = cs.id
  WHERE ts.topic_id = p_topic_id
  ORDER BY stories_published_7d DESC NULLS LAST, cs.source_name;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_topic_source_stats(uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_topic_source_stats IS 'Returns simplified source statistics for a topic, showing actual published story counts';