select cron.unschedule('illustration-batch-poller-hourly');
select cron.schedule(
  'illustration-batch-poller-hourly',
  '17 * * * *',
  $$
  select net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/illustration-batch-poller',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer 9e5bfac5a4c595e25caf7e13c049f842eb4a8ab5b69a7efa"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);