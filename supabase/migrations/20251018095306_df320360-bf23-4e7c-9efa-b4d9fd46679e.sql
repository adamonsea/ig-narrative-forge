-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule Reddit community insights processor to run daily at 2 AM UTC
SELECT cron.schedule(
  'reddit-community-insights-daily',
  '0 2 * * *', -- 2 AM UTC daily
  $$
  SELECT
    net.http_post(
      url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/reddit-community-scheduler',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.nNRlT9KsFhj7YU6ER0tE5t_6ZwSxlMOhPLmA0VZK-Xo"}'::jsonb,
      body:=concat('{"scheduled": true, "triggered_at": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);

-- Add helpful comment
COMMENT ON EXTENSION pg_cron IS 'Reddit community insights run daily at 2 AM UTC to fetch and analyze community discussions for enabled topics.';