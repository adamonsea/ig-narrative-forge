-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- Daily Roundup: Generate at 11 PM UTC (captures full day)
-- ============================================
SELECT cron.schedule(
  'generate-daily-roundups-all-topics',
  '0 23 * * *',
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/generate-daily-roundup',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body:=jsonb_build_object('date', CURRENT_DATE::text)
  ) as request_id;
  $$
);

-- ============================================
-- Weekly Roundup: Generate at 12 AM UTC Monday (captures previous week)
-- ============================================
SELECT cron.schedule(
  'generate-weekly-roundups-all-topics',
  '0 0 * * 1',
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/generate-weekly-roundup',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body:=jsonb_build_object('week_start', (CURRENT_DATE - INTERVAL '7 days')::text)
  ) as request_id;
  $$
);

-- ============================================
-- Send Daily Notifications: 1 AM UTC = 8 PM EST previous day
-- ============================================
SELECT cron.schedule(
  'send-daily-roundup-notifications',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-roundup-notifier',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body:=jsonb_build_object('notification_type', 'daily')
  ) as request_id;
  $$
);

-- ============================================
-- Send Weekly Notifications: 2 PM UTC Sunday = 9 AM EST
-- ============================================
SELECT cron.schedule(
  'send-weekly-roundup-notifications',
  '0 14 * * 0',
  $$
  SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-roundup-notifier',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body:=jsonb_build_object('notification_type', 'weekly')
  ) as request_id;
  $$
);

-- Log successful setup
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info', 
  'Roundup automation cron jobs scheduled',
  jsonb_build_object(
    'daily_roundup_generation', '23:00 UTC',
    'daily_notifications', '01:00 UTC (8 PM EST)',
    'weekly_roundup_generation', '00:00 Monday UTC',
    'weekly_notifications', '14:00 Sunday UTC (9 AM EST)'
  ),
  'setup_roundup_automation'
);