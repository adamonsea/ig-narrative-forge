-- Add column to store AI-generated animation suggestions
ALTER TABLE stories 
ADD COLUMN IF NOT EXISTS animation_suggestions TEXT[] DEFAULT NULL;

COMMENT ON COLUMN stories.animation_suggestions IS 
  'AI-generated animation motion suggestions for the cover illustration';