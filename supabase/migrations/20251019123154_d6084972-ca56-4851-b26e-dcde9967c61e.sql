-- Add is_parliamentary column to stories table
ALTER TABLE stories 
ADD COLUMN IF NOT EXISTS is_parliamentary boolean DEFAULT false;

-- Backfill existing parliamentary stories
UPDATE stories s
SET is_parliamentary = true
WHERE EXISTS (
  SELECT 1 FROM parliamentary_mentions pm
  WHERE pm.story_id = s.id
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_stories_is_parliamentary 
ON stories(is_parliamentary) 
WHERE is_parliamentary = true;

-- Add comment for documentation
COMMENT ON COLUMN stories.is_parliamentary IS 'Indicates if this story is about parliamentary voting activity';