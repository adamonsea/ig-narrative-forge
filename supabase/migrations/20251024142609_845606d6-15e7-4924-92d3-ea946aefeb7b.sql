-- Add MP details to stories table for parliamentary vote tracking
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS mp_name TEXT,
ADD COLUMN IF NOT EXISTS mp_party TEXT,
ADD COLUMN IF NOT EXISTS constituency TEXT;

-- Add index for parliamentary story queries
CREATE INDEX IF NOT EXISTS idx_stories_parliamentary 
ON stories(is_parliamentary) 
WHERE is_parliamentary = true;