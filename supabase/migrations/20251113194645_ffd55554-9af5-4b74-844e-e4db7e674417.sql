
-- Enable required extensions
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Schedule cleanup-temp-uploads to run daily at midnight UTC
select cron.schedule(
  'cleanup-temp-uploads-daily',
  '0 0 * * *',
  $$
  select
    net.http_post(
        url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/cleanup-temp-uploads',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
        body:='{"maxAgeHours": 24, "dryRun": false}'::jsonb
    ) as request_id;
  $$
);
