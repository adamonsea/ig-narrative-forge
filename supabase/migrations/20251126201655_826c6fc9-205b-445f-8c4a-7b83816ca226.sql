-- Add play mode setting to topic_insight_settings
ALTER TABLE topic_insight_settings
ADD COLUMN play_mode_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN topic_insight_settings.play_mode_enabled IS 'Enable swipe-based play mode for this topic (premium feature, disabled by default)';

-- Enable play mode for all existing topics (as requested by user)
UPDATE topic_insight_settings
SET 
  play_mode_enabled = TRUE,
  is_premium_tier = TRUE,
  updated_at = NOW();