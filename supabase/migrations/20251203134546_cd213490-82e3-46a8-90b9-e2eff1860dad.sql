-- ==============================
-- DRIP FEED FEATURE - Safe Implementation
-- ==============================

-- Add drip feed configuration to topics table
ALTER TABLE topics ADD COLUMN IF NOT EXISTS drip_feed_enabled boolean DEFAULT false;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS drip_release_interval_hours integer DEFAULT 4;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS drip_stories_per_release integer DEFAULT 2;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS drip_start_hour integer DEFAULT 6;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS drip_end_hour integer DEFAULT 22;

-- Add scheduling columns to stories table
ALTER TABLE stories ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamp with time zone;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS drip_queued_at timestamp with time zone;

-- Create index for efficient drip feed queries
CREATE INDEX IF NOT EXISTS idx_stories_scheduled_publish 
ON stories(scheduled_publish_at) 
WHERE scheduled_publish_at IS NOT NULL;

-- Create index for topic drip feed lookups
CREATE INDEX IF NOT EXISTS idx_topics_drip_feed_enabled 
ON topics(drip_feed_enabled) 
WHERE drip_feed_enabled = true;

-- Add comments for documentation
COMMENT ON COLUMN topics.drip_feed_enabled IS 'When true, stories are released gradually instead of all at once';
COMMENT ON COLUMN topics.drip_release_interval_hours IS 'Hours between each story release batch (1-8)';
COMMENT ON COLUMN topics.drip_stories_per_release IS 'Number of stories to release per interval (1-5)';
COMMENT ON COLUMN topics.drip_start_hour IS 'Hour of day (0-23) when drip releases start';
COMMENT ON COLUMN topics.drip_end_hour IS 'Hour of day (0-23) when drip releases end';
COMMENT ON COLUMN stories.scheduled_publish_at IS 'When story should be published (NULL = immediate)';
COMMENT ON COLUMN stories.drip_queued_at IS 'When story was added to drip queue';