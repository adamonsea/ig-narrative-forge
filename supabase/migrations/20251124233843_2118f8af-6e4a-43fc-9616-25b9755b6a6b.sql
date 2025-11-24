-- Fix queue-processor cron job SQL syntax error
-- The job was failing with "cannot cast type bigint to jsonb" error

-- Delete the broken job
SELECT cron.unschedule('process-content-generation-queue');

-- Recreate with correct syntax (remove ::jsonb cast, use "as request_id" instead)
SELECT cron.schedule(
  'process-content-generation-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/queue-processor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);