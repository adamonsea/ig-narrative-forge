-- Reset all scrape schedules to run immediately
UPDATE scrape_schedules 
SET 
  next_run_at = now() - interval '1 minute',
  last_run_at = null,
  run_count = 0,
  success_rate = 100.0
WHERE is_active = true;

-- Add scraping_method column to content_sources if not exists
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name='content_sources' AND column_name='scraping_method') THEN
    ALTER TABLE content_sources ADD COLUMN scraping_method TEXT DEFAULT 'unknown';
  END IF;
END $$;

-- Log the reset action
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info', 
  'Reset all scrape schedules for immediate execution', 
  jsonb_build_object(
    'reset_count', (SELECT count(*) FROM scrape_schedules WHERE is_active = true),
    'next_run_times_updated', 'all set to now - 1 minute'
  ),
  'schedule_reset_migration'
);