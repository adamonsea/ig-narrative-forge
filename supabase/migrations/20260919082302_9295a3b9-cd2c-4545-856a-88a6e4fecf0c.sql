SELECT cron.schedule(
  'feed-lead-nudge-daily',
  '30 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/feed-lead-nudge',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.nNRlT9KsFhj7YU6ER0tE5t_6ZwSxlMOhPLmA0VZK-Xo"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  ) as request_id;
  $$
);