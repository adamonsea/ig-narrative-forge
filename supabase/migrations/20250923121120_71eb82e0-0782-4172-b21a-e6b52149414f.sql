-- Change automation defaults to OFF for new topics
ALTER TABLE topics 
ALTER COLUMN auto_simplify_enabled SET DEFAULT false;

-- Update existing automation settings table if it has different defaults
ALTER TABLE topic_automation_settings 
ALTER COLUMN is_active SET DEFAULT false,
ALTER COLUMN auto_simplify_enabled SET DEFAULT false;

-- Update global automation to be disabled by default
INSERT INTO global_automation_settings (id, enabled, scrape_frequency_hours, auto_simplify_enabled, automation_quality_threshold)
VALUES (gen_random_uuid(), false, 24, false, 60)
ON CONFLICT DO NOTHING;