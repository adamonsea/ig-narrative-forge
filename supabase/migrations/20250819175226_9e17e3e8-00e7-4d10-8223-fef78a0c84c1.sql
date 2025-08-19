-- Delete the existing cron job and recreate it with every minute schedule
SELECT cron.unschedule('process-content-generation-queue');

-- Create new cron job that runs every minute
SELECT cron.schedule(
  'process-content-generation-queue',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/queue-processor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.J08xDEeOIFyQANGLpHU3QyNX7K3YD9QY8pPPE24GZpE"}'::jsonb
  ) as request_id;
  $$
);