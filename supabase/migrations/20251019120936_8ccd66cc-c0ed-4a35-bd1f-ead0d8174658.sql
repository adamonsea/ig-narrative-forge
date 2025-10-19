-- Fix existing parliamentary vote URLs to use correct domain
UPDATE parliamentary_mentions
SET vote_url = regexp_replace(
  vote_url,
  '^https?://commonsvotes\.digiminster\.com/Divisions/Details/(\d+)$',
  'https://votes.parliament.uk/votes/commons/division/\1'
)
WHERE vote_url LIKE '%commonsvotes.digiminster.com%';

-- Schedule auto-recovery function to run every 5 minutes
SELECT cron.schedule(
  'auto_recover_stuck_stories_every_5_min',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/auto-recover-stuck-stories',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);