-- Create automated sentiment card generation schedule
-- This runs daily at 2 AM UTC to check for keywords that need new cards

SELECT cron.schedule(
  'sentiment-card-daily-generation',
  '0 2 * * *', -- Daily at 2 AM UTC
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/sentiment-card-scheduler',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

-- Add comment explaining the schedule
COMMENT ON EXTENSION pg_cron IS 'Automated sentiment card generation runs daily at 2 AM UTC to process tracked keywords and generate new sentiment cards for enabled topics.';