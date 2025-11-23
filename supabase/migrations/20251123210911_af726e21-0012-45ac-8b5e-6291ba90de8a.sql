
-- Schedule insight card generation 3 times daily (6 AM, 2 PM, 10 PM)
select cron.schedule(
  'generate-insight-cards-3x-daily',
  '0 6,14,22 * * *',
  $$
  select
    net.http_post(
        url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/schedule-insight-cards',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);
