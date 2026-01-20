-- Enable tracking for the published sentiment keywords so scheduler can process them
UPDATE sentiment_keyword_tracking
SET tracked_for_cards = true,
    current_trend = 'sustained',
    next_card_due_at = NOW() - INTERVAL '1 hour',
    updated_at = NOW()
WHERE status = 'published';

-- Add cron job for sentiment-history-snapshot (weekly on Sundays at 3am)
SELECT cron.schedule(
  'sentiment-history-weekly-snapshot',
  '0 3 * * 0', -- Every Sunday at 3am
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/sentiment-history-snapshot',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);