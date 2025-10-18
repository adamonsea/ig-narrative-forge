-- Add is_visible column to community_pulse_keywords for per-keyword visibility control
ALTER TABLE community_pulse_keywords 
ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_community_pulse_visible 
ON community_pulse_keywords(topic_id, is_visible, set_number) 
WHERE is_visible = true;

COMMENT ON COLUMN community_pulse_keywords.is_visible IS 'Controls whether this keyword appears in the feed rotation';