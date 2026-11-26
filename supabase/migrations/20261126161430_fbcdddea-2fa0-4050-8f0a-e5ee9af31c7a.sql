SELECT cron.unschedule('daily-keyword-analytics-update');
SELECT cron.schedule(
  'daily-keyword-analytics-update',
  '45 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/backfill-keyword-analytics',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-sync-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'search_sync_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  ) AS request_id;
  $$
);