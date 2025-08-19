-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create automated queue processing job that runs every 5 minutes
SELECT cron.schedule(
  'process-content-generation-queue',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
        url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/queue-processor',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
        body:=concat('{"automated": true, "timestamp": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);

-- Log the cron job setup
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info', 
  'Automated queue processing cron job created', 
  jsonb_build_object('schedule', '*/5 * * * *', 'function', 'queue-processor'),
  'cron_setup'
);