SELECT cron.unschedule('ingest-chamber-events-daily');
SELECT cron.schedule(
  'ingest-chamber-events-daily',
  '30 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/ingest-chamber-events',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer 9e5bfac5a4c595e25caf7e13c049f842eb4a8ab5b69a7efa"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);