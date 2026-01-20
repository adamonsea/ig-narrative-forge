-- Fix get_story_reaction_counts_batch to only count thumbs reactions (is_reaction = true)
-- Previously this was counting ALL swipes including Play Mode swipes, inflating counts

CREATE OR REPLACE FUNCTION get_story_reaction_counts_batch(
  p_story_ids UUID[],
  p_visitor_id TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  story_id UUID,
  thumbs_up BIGINT,
  thumbs_down BIGINT,
  user_reaction TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH story_counts AS (
    SELECT 
      ss.story_id,
      COUNT(*) FILTER (WHERE ss.swipe_type = 'like' AND ss.is_reaction = true) AS thumbs_up,
      COUNT(*) FILTER (WHERE ss.swipe_type = 'discard' AND ss.is_reaction = true) AS thumbs_down
    FROM story_swipes ss
    WHERE ss.story_id = ANY(p_story_ids)
    GROUP BY ss.story_id
  ),
  user_reactions AS (
    SELECT DISTINCT ON (ss.story_id)
      ss.story_id,
      ss.swipe_type AS user_reaction
    FROM story_swipes ss
    WHERE ss.story_id = ANY(p_story_ids)
      AND ss.is_reaction = true
      AND (
        (p_user_id IS NOT NULL AND ss.user_id = p_user_id)
        OR (p_user_id IS NULL AND ss.visitor_id = p_visitor_id)
      )
    ORDER BY ss.story_id, ss.created_at DESC
  )
  SELECT 
    s.id AS story_id,
    COALESCE(sc.thumbs_up, 0) AS thumbs_up,
    COALESCE(sc.thumbs_down, 0) AS thumbs_down,
    ur.user_reaction
  FROM unnest(p_story_ids) AS s(id)
  LEFT JOIN story_counts sc ON sc.story_id = s.id
  LEFT JOIN user_reactions ur ON ur.story_id = s.id;
END;
$$;