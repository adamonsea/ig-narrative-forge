-- Update the cron job to use the new topic-level eezee-automation-service
SELECT cron.unschedule('eezee-automation-daily');

SELECT cron.schedule(
  'eezee-automation-daily',
  '0 2 * * *', -- Run at 2 AM daily
  $$
  SELECT
    net.http_post(
        url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/eezee-automation-service',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.vQgVmLdy2_nu8EWq4TQfk8-jEIttI0d1Kht7Nsdv_v0"}'::jsonb,
        body:='{"forceRun": false, "dryRun": false}'::jsonb
    ) as request_id;
  $$
);