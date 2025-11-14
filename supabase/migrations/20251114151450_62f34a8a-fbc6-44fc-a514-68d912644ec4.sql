
-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create cron job to run auto-simplify-queue every 10 minutes
SELECT cron.schedule(
  'auto-simplify-queue-cron',
  '*/10 * * * *',
  $$
  SELECT
    net.http_post(
        url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/auto-simplify-queue',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);
