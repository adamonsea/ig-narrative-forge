-- Add illustration toggle for holiday mode
ALTER TABLE topic_automation_settings 
ADD COLUMN auto_illustrate_in_holiday BOOLEAN DEFAULT true;

COMMENT ON COLUMN topic_automation_settings.auto_illustrate_in_holiday IS 'Controls whether auto-illustration is enabled within holiday mode (defaults to true for backward compatibility)';