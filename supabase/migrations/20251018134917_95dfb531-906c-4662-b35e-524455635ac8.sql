-- Add set_number column to community_pulse_keywords table
ALTER TABLE community_pulse_keywords 
ADD COLUMN IF NOT EXISTS set_number INTEGER DEFAULT 1;

-- Add index for efficient querying by topic and set
CREATE INDEX IF NOT EXISTS idx_pulse_keywords_topic_set 
ON community_pulse_keywords(topic_id, set_number, created_at DESC);

-- Add comment for documentation
COMMENT ON COLUMN community_pulse_keywords.set_number IS 'Groups keywords into sets of 3 (1, 2, or 3) for rotating display in feed';