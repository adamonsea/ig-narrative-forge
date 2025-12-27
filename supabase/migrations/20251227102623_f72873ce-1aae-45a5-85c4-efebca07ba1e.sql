-- Extend story_swipes to support anonymous reactions
ALTER TABLE story_swipes 
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE story_swipes 
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS is_reaction BOOLEAN DEFAULT false;

-- Add constraint: must have either user_id OR visitor_id
ALTER TABLE story_swipes 
  ADD CONSTRAINT user_or_visitor CHECK (user_id IS NOT NULL OR visitor_id IS NOT NULL);

-- Unique per visitor per story (for reactions only)
CREATE UNIQUE INDEX IF NOT EXISTS story_reactions_visitor_idx 
  ON story_swipes(story_id, visitor_id) 
  WHERE visitor_id IS NOT NULL AND is_reaction = true;

-- RPC function for upserting story reactions (atomic insert/update)
CREATE OR REPLACE FUNCTION upsert_story_reaction(
  p_story_id UUID,
  p_visitor_id TEXT,
  p_swipe_type TEXT,
  p_topic_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(thumbs_up BIGINT, thumbs_down BIGINT, user_reaction TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_type TEXT;
BEGIN
  -- Check if user already has a reaction on this story
  SELECT swipe_type INTO v_existing_type
  FROM story_swipes
  WHERE story_id = p_story_id
    AND is_reaction = true
    AND (
      (p_user_id IS NOT NULL AND user_id = p_user_id)
      OR (p_user_id IS NULL AND visitor_id = p_visitor_id)
    );

  IF v_existing_type IS NOT NULL THEN
    IF v_existing_type = p_swipe_type THEN
      -- Same reaction, remove it (toggle off)
      DELETE FROM story_swipes
      WHERE story_id = p_story_id
        AND is_reaction = true
        AND (
          (p_user_id IS NOT NULL AND user_id = p_user_id)
          OR (p_user_id IS NULL AND visitor_id = p_visitor_id)
        );
    ELSE
      -- Different reaction, update it
      UPDATE story_swipes
      SET swipe_type = p_swipe_type, created_at = NOW()
      WHERE story_id = p_story_id
        AND is_reaction = true
        AND (
          (p_user_id IS NOT NULL AND user_id = p_user_id)
          OR (p_user_id IS NULL AND visitor_id = p_visitor_id)
        );
    END IF;
  ELSE
    -- No existing reaction, insert new one
    INSERT INTO story_swipes (story_id, user_id, visitor_id, swipe_type, topic_id, is_reaction)
    VALUES (p_story_id, p_user_id, p_visitor_id, p_swipe_type, p_topic_id, true);
  END IF;

  -- Return updated counts and user's current reaction
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE swipe_type = 'like' AND is_reaction = true) as thumbs_up,
    COUNT(*) FILTER (WHERE swipe_type = 'discard' AND is_reaction = true) as thumbs_down,
    (
      SELECT ss.swipe_type 
      FROM story_swipes ss 
      WHERE ss.story_id = p_story_id 
        AND ss.is_reaction = true
        AND (
          (p_user_id IS NOT NULL AND ss.user_id = p_user_id)
          OR (p_user_id IS NULL AND ss.visitor_id = p_visitor_id)
        )
    ) as user_reaction
  FROM story_swipes
  WHERE story_id = p_story_id;
END;
$$;

-- Function to get reaction counts for a story
CREATE OR REPLACE FUNCTION get_story_reaction_counts(
  p_story_id UUID,
  p_visitor_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(thumbs_up BIGINT, thumbs_down BIGINT, user_reaction TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE swipe_type = 'like' AND is_reaction = true) as thumbs_up,
    COUNT(*) FILTER (WHERE swipe_type = 'discard' AND is_reaction = true) as thumbs_down,
    (
      SELECT ss.swipe_type 
      FROM story_swipes ss 
      WHERE ss.story_id = p_story_id 
        AND ss.is_reaction = true
        AND (
          (p_user_id IS NOT NULL AND ss.user_id = p_user_id)
          OR (p_user_id IS NULL AND p_visitor_id IS NOT NULL AND ss.visitor_id = p_visitor_id)
        )
    ) as user_reaction
  FROM story_swipes
  WHERE story_id = p_story_id;
END;
$$;