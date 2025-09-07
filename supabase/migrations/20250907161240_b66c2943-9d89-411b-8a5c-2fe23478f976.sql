-- Add cron job for proactive source monitoring
SELECT cron.schedule(
    'proactive-source-monitoring', 
    '0 */6 * * *', -- Every 6 hours
    $$
    SELECT
      net.http_post(
          url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/proactive-source-monitor',
          headers:=jsonb_build_object(
            'Content-Type','application/json', 
            'Authorization', 'Bearer ' || current_setting('app.service_role_key')
          ),
          body:=jsonb_build_object()
      ) as request_id;
    $$
);