-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the reddit community intelligence processor to run daily at 2 AM UTC
SELECT cron.schedule(
  'reddit-community-intelligence-daily',
  '0 2 * * *', -- 2 AM UTC every day
  $$
  SELECT
    net.http_post(
        url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/reddit-community-scheduler',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Log the cron job creation
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Reddit community intelligence cron job scheduled',
  jsonb_build_object(
    'schedule', '0 2 * * *',
    'function', 'reddit-community-scheduler'
  ),
  'cron_setup'
);