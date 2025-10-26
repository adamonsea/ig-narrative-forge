-- Add new automation mode columns to topic_automation_settings
ALTER TABLE topic_automation_settings
ADD COLUMN IF NOT EXISTS automation_mode TEXT DEFAULT 'manual' 
  CHECK (automation_mode IN ('manual', 'auto_gather', 'auto_simplify', 'auto_illustrate', 'holiday')),
ADD COLUMN IF NOT EXISTS auto_illustrate_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS illustration_quality_threshold INTEGER DEFAULT 70;

-- Create trigger function to auto-initialize automation settings for new topics
CREATE OR REPLACE FUNCTION create_default_topic_automation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO topic_automation_settings (
    topic_id,
    scrape_frequency_hours,
    is_active,
    automation_mode,
    quality_threshold,
    auto_simplify_enabled,
    auto_illustrate_enabled,
    illustration_quality_threshold,
    next_run_at
  ) VALUES (
    NEW.id,
    12,  -- Default: every 12 hours
    false,  -- Disabled by default
    'manual',  -- Manual mode by default
    60,  -- 60% quality threshold
    false,
    false,
    70,  -- 70% threshold for illustrations
    NOW() + INTERVAL '12 hours'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger to topics table
DROP TRIGGER IF EXISTS on_topic_created ON topics;
CREATE TRIGGER on_topic_created
  AFTER INSERT ON topics
  FOR EACH ROW
  EXECUTE FUNCTION create_default_topic_automation();

-- Add quality_score column to stories table for auto-illustration logic
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS quality_score INTEGER;

-- Add index for auto-illustration queries
CREATE INDEX IF NOT EXISTS idx_stories_auto_illustrate 
  ON stories(created_at, quality_score) 
  WHERE cover_illustration_url IS NULL AND status IN ('ready', 'published');