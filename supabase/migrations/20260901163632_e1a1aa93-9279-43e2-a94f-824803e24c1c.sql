SELECT cron.unschedule('ingest-chamber-events-daily');
SELECT cron.schedule(
  'ingest-chamber-events-daily',
  '30 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/ingest-chamber-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object()
  );
  $$
);