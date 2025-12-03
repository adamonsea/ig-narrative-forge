-- Add cron job to run drip-feed-scheduler every hour
SELECT cron.schedule(
  'drip-feed-scheduler',
  '0 * * * *',
  $$
  SELECT
    net.http_post(
      url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/drip-feed-scheduler',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);