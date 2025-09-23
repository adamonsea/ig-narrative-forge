-- Change automation defaults to OFF for new topics
ALTER TABLE topics 
ALTER COLUMN auto_simplify_enabled SET DEFAULT false;

-- Update existing automation settings table defaults 
ALTER TABLE topic_automation_settings 
ALTER COLUMN is_active SET DEFAULT false,
ALTER COLUMN auto_simplify_enabled SET DEFAULT false;