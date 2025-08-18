-- Enable pg_cron for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the automated scraper to run twice daily (every 12 hours)
-- Run at 6 AM and 6 PM UTC
SELECT cron.schedule(
  'automated-scraper-6am',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
    body := '{"scheduled": true, "trigger": "morning"}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'automated-scraper-6pm',
  '0 18 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-scheduler',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
    body := '{"scheduled": true, "trigger": "evening"}'::jsonb
  ) as request_id;
  $$
);