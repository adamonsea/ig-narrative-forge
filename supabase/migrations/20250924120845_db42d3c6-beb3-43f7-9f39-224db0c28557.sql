-- Insert default automation configuration if it doesn't exist
INSERT INTO scheduler_settings (setting_key, setting_value, description)
VALUES (
  'automation_config',
  '{"enabled": false, "scrape_frequency_hours": 12, "auto_simplify_enabled": true, "auto_simplify_quality_threshold": 60}'::jsonb,
  'Global automation configuration for eezee news automation service'
)
ON CONFLICT (setting_key) DO NOTHING;