-- Create settings table for insight card types per topic
CREATE TABLE IF NOT EXISTS topic_insight_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  
  -- Card type toggles
  story_momentum_enabled BOOLEAN DEFAULT TRUE,
  social_proof_enabled BOOLEAN DEFAULT FALSE,
  this_time_last_month_enabled BOOLEAN DEFAULT FALSE,
  
  -- Premium/feature flag
  is_premium_tier BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One settings row per topic
  UNIQUE(topic_id)
);

-- Create index for fast lookups
CREATE INDEX idx_topic_insight_settings_topic_id ON topic_insight_settings(topic_id);

-- Enable RLS
ALTER TABLE topic_insight_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read settings for their topics
CREATE POLICY "Users can read insight settings for their topics"
  ON topic_insight_settings
  FOR SELECT
  TO authenticated
  USING (
    topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    )
  );

-- Allow authenticated users to update settings for their topics
CREATE POLICY "Users can update insight settings for their topics"
  ON topic_insight_settings
  FOR UPDATE
  TO authenticated
  USING (
    topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    )
  );

-- Allow authenticated users to insert settings for their topics
CREATE POLICY "Users can insert insight settings for their topics"
  ON topic_insight_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    )
  );

-- Service role has full access
CREATE POLICY "Service role has full access to insight settings"
  ON topic_insight_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create function to auto-create settings when a topic is created
CREATE OR REPLACE FUNCTION create_default_insight_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO topic_insight_settings (topic_id, story_momentum_enabled, social_proof_enabled, this_time_last_month_enabled)
  VALUES (NEW.id, TRUE, FALSE, FALSE)
  ON CONFLICT (topic_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create settings for new topics
CREATE TRIGGER create_insight_settings_for_new_topic
  AFTER INSERT ON topics
  FOR EACH ROW
  EXECUTE FUNCTION create_default_insight_settings();

-- Backfill existing topics with default settings
INSERT INTO topic_insight_settings (topic_id, story_momentum_enabled, social_proof_enabled, this_time_last_month_enabled)
SELECT id, TRUE, FALSE, FALSE
FROM topics
ON CONFLICT (topic_id) DO NOTHING;

COMMENT ON TABLE topic_insight_settings IS 'Controls which automated insight card types are enabled per topic, with premium feature flags';
COMMENT ON COLUMN topic_insight_settings.story_momentum_enabled IS 'Show trending stories card (free feature, enabled by default)';
COMMENT ON COLUMN topic_insight_settings.social_proof_enabled IS 'Show community/social proof card (premium feature, disabled by default)';
COMMENT ON COLUMN topic_insight_settings.this_time_last_month_enabled IS 'Show flashback card (premium feature, disabled by default)';
COMMENT ON COLUMN topic_insight_settings.is_premium_tier IS 'Whether this topic has access to premium insight features';
