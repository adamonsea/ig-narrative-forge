-- Update cron job to use the new eezee automation service
-- First, remove existing automation jobs if they exist
SELECT cron.unschedule('eezee-automation-12h') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'eezee-automation-12h');

-- Create new 12-hour automation job
SELECT cron.schedule(
  'eezee-automation-12h',
  '0 6,18 * * *', -- Run at 6 AM and 6 PM daily
  $$
  SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/eezee-automation-service',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.vQgVmLdy2_nu8EWq4TQfk8-jEIttI0d1Kht7Nsdv_v0"}'::jsonb,
    body := '{"scheduled_run": true}'::jsonb
  ) as request_id;
  $$
);