-- Add animated_illustration_url column to stories table for 2-second MP4 animations
ALTER TABLE stories 
ADD COLUMN IF NOT EXISTS animated_illustration_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN stories.animated_illustration_url IS 'URL to 2-second animated MP4 version of cover illustration generated via Runway Gen-3 Turbo';