-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule daily-content-monitor to run every 4 hours
-- This checks for new content availability across all topics
SELECT cron.schedule(
  'daily-content-monitor-every-4-hours',
  '0 */4 * * *', -- Every 4 hours at the top of the hour
  $$
  SELECT
    net.http_post(
      url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/daily-content-monitor',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
      body := '{"autoTriggerScraping": true}'::jsonb
    ) as request_id;
  $$
);

-- Schedule universal-topic-automation to run every 2 hours
-- This triggers scraping for topics that are due based on their frequency settings
SELECT cron.schedule(
  'universal-topic-automation-every-2-hours',
  '0 */2 * * *', -- Every 2 hours at the top of the hour
  $$
  SELECT
    net.http_post(
      url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/universal-topic-automation',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- Add helpful comment
COMMENT ON EXTENSION pg_cron IS 'Automated content scraping: daily-content-monitor runs every 4h, universal-topic-automation runs every 2h';