-- Create batch function to get reaction counts for multiple stories at once
-- This replaces N individual calls with a single query for better performance

CREATE OR REPLACE FUNCTION get_story_reaction_counts_batch(
  p_story_ids uuid[],
  p_visitor_id text,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  story_id uuid,
  thumbs_up bigint,
  thumbs_down bigint,
  user_reaction text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH story_counts AS (
    -- Get aggregated counts per story
    SELECT 
      ss.story_id,
      COUNT(*) FILTER (WHERE ss.swipe_type = 'like') AS thumbs_up,
      COUNT(*) FILTER (WHERE ss.swipe_type = 'discard') AS thumbs_down
    FROM story_swipes ss
    WHERE ss.story_id = ANY(p_story_ids)
    GROUP BY ss.story_id
  ),
  user_reactions AS (
    -- Get user's reaction per story (prioritize user_id over visitor_id)
    SELECT DISTINCT ON (ss.story_id)
      ss.story_id,
      ss.swipe_type AS user_reaction
    FROM story_swipes ss
    WHERE ss.story_id = ANY(p_story_ids)
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

-- Add index to optimize the batch query if not exists
CREATE INDEX IF NOT EXISTS idx_story_swipes_story_type 
  ON story_swipes(story_id, swipe_type);

CREATE INDEX IF NOT EXISTS idx_story_swipes_user_id 
  ON story_swipes(user_id) 
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_story_swipes_visitor_id 
  ON story_swipes(visitor_id);

COMMENT ON FUNCTION get_story_reaction_counts_batch IS 'Batch fetch reaction counts for multiple stories in single call - used for feed performance optimization';