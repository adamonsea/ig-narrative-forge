-- Get swipe stats for a single story
CREATE OR REPLACE FUNCTION get_story_swipe_stats(p_story_id uuid)
RETURNS TABLE(
  like_count bigint,
  discard_count bigint,
  total_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE swipe_type = 'like') as like_count,
    COUNT(*) FILTER (WHERE swipe_type = 'discard') as discard_count,
    COUNT(*) as total_count
  FROM story_swipes
  WHERE story_id = p_story_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get insights for game mode (swipe mode) for a topic
CREATE OR REPLACE FUNCTION get_swipe_insights(p_topic_id uuid)
RETURNS TABLE(
  total_readers bigint,
  total_likes bigint,
  total_discards bigint,
  approval_rate numeric,
  top_stories jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH swipe_counts AS (
    SELECT 
      COUNT(DISTINCT user_id) as readers,
      COUNT(*) FILTER (WHERE swipe_type = 'like') as likes,
      COUNT(*) FILTER (WHERE swipe_type = 'discard') as discards
    FROM story_swipes
    WHERE topic_id = p_topic_id
  ),
  top_liked AS (
    SELECT 
      ss.story_id,
      s.title,
      COUNT(*) FILTER (WHERE ss.swipe_type = 'like') as likes,
      COUNT(*) FILTER (WHERE ss.swipe_type = 'discard') as dislikes
    FROM story_swipes ss
    JOIN stories s ON s.id = ss.story_id
    WHERE ss.topic_id = p_topic_id
    GROUP BY ss.story_id, s.title
    ORDER BY likes DESC
    LIMIT 5
  )
  SELECT 
    sc.readers as total_readers,
    sc.likes as total_likes,
    sc.discards as total_discards,
    CASE 
      WHEN (sc.likes + sc.discards) > 0 
      THEN ROUND((sc.likes::numeric / (sc.likes + sc.discards)::numeric) * 100, 1)
      ELSE 0
    END as approval_rate,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'story_id', tl.story_id,
        'title', tl.title,
        'likes', tl.likes,
        'dislikes', tl.dislikes
      )) FROM top_liked tl),
      '[]'::jsonb
    ) as top_stories
  FROM swipe_counts sc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get source health stats for topic dashboard bar chart
CREATE OR REPLACE FUNCTION get_source_health_stats(p_topic_id uuid)
RETURNS TABLE(
  source_id uuid,
  source_name text,
  success_rate numeric,
  articles_last_7_days bigint,
  last_success_at timestamptz,
  consecutive_failures int
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id as source_id,
    cs.source_name,
    COALESCE(cs.success_rate, 0) as success_rate,
    (
      SELECT COUNT(*)
      FROM topic_articles ta
      WHERE ta.source_id = cs.id 
        AND ta.topic_id = p_topic_id
        AND ta.created_at > NOW() - INTERVAL '7 days'
    ) as articles_last_7_days,
    cs.last_scraped_at as last_success_at,
    COALESCE(cs.consecutive_failures, 0) as consecutive_failures
  FROM topic_sources ts
  JOIN content_sources cs ON cs.id = ts.source_id
  WHERE ts.topic_id = p_topic_id
    AND ts.is_active = true
  ORDER BY cs.success_rate DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;