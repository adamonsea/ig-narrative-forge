-- Delete the old 5 PM daily notification cron job
SELECT cron.unschedule('send-daily-roundup-notifications');

-- Create new 9 AM daily notification cron job
SELECT cron.schedule(
  'send-daily-roundup-notifications-9am',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-roundup-notifier',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI'
    ),
    body:=jsonb_build_object('notification_type', 'daily')
  )::text;
  $$
);