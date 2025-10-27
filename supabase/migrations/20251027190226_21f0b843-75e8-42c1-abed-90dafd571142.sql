-- Update push notification cron schedules for Europe/London timezone
-- Daily notifications: 5 PM London (17:00 UTC in winter/GMT, 16:00 UTC in summer/BST)
-- Weekly notifications: Sunday 9 AM London (09:00 UTC in winter/GMT, 08:00 UTC in summer/BST)
-- Setting to winter/GMT times (17:00 and 09:00 UTC) - will shift by 1 hour during BST

-- Unschedule existing jobs
SELECT cron.unschedule('send-daily-roundup-notifications');
SELECT cron.unschedule('send-weekly-roundup-notifications');

-- Reschedule daily notifications for 17:00 UTC (5 PM London GMT, 6 PM London BST)
SELECT cron.schedule(
  'send-daily-roundup-notifications',
  '0 17 * * *',
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-roundup-notifier',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.T6VZRVMt0Kd56L6xVz7Z6K9bGZmUZ7L_1W7VZ7Z7Z7Z'
    ),
    body:=jsonb_build_object('notification_type', 'daily')
  )::text;
  $$
);

-- Reschedule weekly notifications for Sunday 09:00 UTC (9 AM London GMT, 10 AM London BST)
SELECT cron.schedule(
  'send-weekly-roundup-notifications',
  '0 9 * * 0',
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-roundup-notifier',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.T6VZRVMt0Kd56L6xVz7Z6K9bGZmUZ7L_1W7VZ7Z7Z7Z'
    ),
    body:=jsonb_build_object('notification_type', 'weekly')
  )::text;
  $$
);