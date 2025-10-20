-- Add auto-scrape tracking columns to daily_content_availability
ALTER TABLE daily_content_availability 
ADD COLUMN IF NOT EXISTS auto_scrape_triggered BOOLEAN DEFAULT FALSE;

ALTER TABLE daily_content_availability 
ADD COLUMN IF NOT EXISTS auto_scrape_completed_at TIMESTAMPTZ;

ALTER TABLE daily_content_availability 
ADD COLUMN IF NOT EXISTS articles_scraped_count INTEGER DEFAULT 0;

-- Create index for efficient cooldown checks
CREATE INDEX IF NOT EXISTS idx_daily_content_recent_checks 
ON daily_content_availability (topic_id, source_id, created_at DESC);

-- Create cron job to run content monitor every 6 hours
SELECT cron.schedule(
  'proactive-content-monitor',
  '0 */6 * * *', -- Every 6 hours at :00
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/daily-content-monitor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.T1bEGeVHtnBVjxqgx7rwlZNm2kIBuPW0KvFLQ8uVHjE"}'::jsonb,
    body:='{"autoTriggerScraping": true}'::jsonb
  ) as request_id;
  $$
);