-- Drop the old cron jobs that time out due to pg_net 5s default
SELECT cron.unschedule(43);
SELECT cron.unschedule(44);

-- Recreate with explicit 60-second timeout using net.http_post timeout param
-- Daily at 9:05 AM UTC (offset from the 9:00 burst)
SELECT cron.schedule(
  'send-daily-roundup-notifications',
  '5 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-roundup-notifier',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.nNRlT9KsFhj7YU6ER0tE5t_6ZwSxlMOhPLmA0VZK-Xo"}'::jsonb,
    body:='{"notification_type": "daily"}'::jsonb,
    timeout_milliseconds:=60000
  ) as request_id;
  $$
);

-- Weekly at 9:10 AM UTC on Sundays
SELECT cron.schedule(
  'send-weekly-roundup-notifications',
  '10 9 * * 0',
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-roundup-notifier',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.nNRlT9KsFhj7YU6ER0tE5t_6ZwSxlMOhPLmA0VZK-Xo"}'::jsonb,
    body:='{"notification_type": "weekly"}'::jsonb,
    timeout_milliseconds:=60000
  ) as request_id;
  $$
);