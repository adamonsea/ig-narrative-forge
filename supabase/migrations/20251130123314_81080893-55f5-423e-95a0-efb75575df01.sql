-- Unschedule the broken notification cron jobs and recreate with valid anon key
SELECT cron.unschedule(31);
SELECT cron.unschedule(37);

-- Recreate weekly notification cron (Sundays at 9am)
SELECT cron.schedule(
  'send-weekly-roundup-notifications',
  '0 9 * * 0',
  $$SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-roundup-notifier',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
    body:='{"notification_type": "weekly"}'::jsonb
  )::text$$
);

-- Recreate daily notification cron (daily at 9am)
SELECT cron.schedule(
  'send-daily-roundup-notifications-9am',
  '0 9 * * *',
  $$SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-roundup-notifier',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
    body:='{"notification_type": "daily"}'::jsonb
  )::text$$
);