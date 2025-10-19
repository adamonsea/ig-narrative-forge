-- Add parliamentary automation tracking columns to topics table
ALTER TABLE topics
ADD COLUMN IF NOT EXISTS parliamentary_last_collection_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS parliamentary_last_weekly_roundup_at TIMESTAMPTZ;

-- Add index for efficient querying of parliamentary-enabled topics
CREATE INDEX IF NOT EXISTS idx_topics_parliamentary_collection 
ON topics(parliamentary_tracking_enabled, parliamentary_last_collection_at) 
WHERE parliamentary_tracking_enabled = true;

-- Add helpful comments
COMMENT ON COLUMN topics.parliamentary_last_collection_at IS 'Last time daily parliamentary votes were collected';
COMMENT ON COLUMN topics.parliamentary_last_weekly_roundup_at IS 'Last time weekly parliamentary roundup was created';