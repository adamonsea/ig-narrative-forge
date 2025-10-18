-- Add subreddit column to community_pulse_keywords
ALTER TABLE community_pulse_keywords 
ADD COLUMN IF NOT EXISTS subreddit TEXT;

-- Delete all existing community pulse keywords to start fresh
DELETE FROM community_pulse_keywords;

-- Add comment explaining the subreddit column
COMMENT ON COLUMN community_pulse_keywords.subreddit IS 'The subreddit name (without r/ prefix) where these keywords were extracted from';