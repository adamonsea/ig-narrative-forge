-- Update cron job to use insight-card-scheduler instead of schedule-insight-cards
-- This ensures both momentum and social proof cards are generated according to topic settings

-- First, unschedule the old job
SELECT cron.unschedule('generate-insight-cards-3x-daily');

-- Then create the new job pointing to the correct scheduler
SELECT cron.schedule(
  'generate-insight-cards-3x-daily',
  '0 6,14,22 * * *',
  $$
  SELECT
    net.http_post(
        url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/insight-card-scheduler',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);