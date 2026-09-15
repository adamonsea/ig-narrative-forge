select cron.schedule(
  'illustration-batch-poller-hourly',
  '17 * * * *',
  $$
  select net.http_post(
    url := 'https://xzkylvsjgsmoarbxjvqf.supabase.co/functions/v1/illustration-batch-poller',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)),
    body := '{}'::jsonb
  );
  $$
);