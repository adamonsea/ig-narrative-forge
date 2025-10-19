-- Reset automation timestamps to fix outdated next_run_at values
UPDATE topic_automation_settings
SET 
  next_run_at = now() + (scrape_frequency_hours || ' hours')::interval,
  updated_at = now()
WHERE is_active = true;

-- Add cron job to publish ready stories every 30 minutes
SELECT cron.schedule(
  'publish-ready-stories-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/publish-ready-stories',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Add cron job to run eezee automation service every 6 hours
SELECT cron.schedule(
  'eezee-automation-6hourly',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/eezee-automation-service',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
    body := '{"forceRun": false}'::jsonb
  ) as request_id;
  $$
);

-- Log the automation setup
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Automation pipeline cron jobs configured',
  jsonb_build_object(
    'cron_jobs', jsonb_build_array(
      'publish-ready-stories-30min',
      'eezee-automation-6hourly'
    ),
    'configured_at', now()
  ),
  'automation_setup_migration'
);