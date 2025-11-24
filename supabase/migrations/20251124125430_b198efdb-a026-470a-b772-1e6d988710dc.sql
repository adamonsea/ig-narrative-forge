-- Security Fix: Replace leaked service_role token with anon key
-- This migration removes the hardcoded service_role JWT from:
-- 1. The update_cron_schedules() function
-- 2. The automated-scraper cron job (Job 11)
-- 3. The queue-processor cron job (Job 8)

-- Step 1: Fix the update_cron_schedules() function to use anon key
CREATE OR REPLACE FUNCTION public.update_cron_schedules()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  scraper_config jsonb;
  cleanup_config jsonb;
  scraper_cron_expr text;
  cleanup_cron_expr text;
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI';
BEGIN
  -- Get current scheduler settings
  SELECT setting_value INTO scraper_config 
  FROM scheduler_settings 
  WHERE setting_key = 'scraper_schedule';
  
  SELECT setting_value INTO cleanup_config 
  FROM scheduler_settings 
  WHERE setting_key = 'cleanup_schedule';
  
  -- Default configs if not found
  IF scraper_config IS NULL THEN
    scraper_config := '{"frequency_hours": 24, "overnight_hour": 2, "enabled": true}';
  END IF;
  
  IF cleanup_config IS NULL THEN
    cleanup_config := '{"frequency_hours": 24, "overnight_hour": 3, "enabled": true}';
  END IF;
  
  -- Generate cron expressions for overnight execution
  scraper_cron_expr := '0 ' || (scraper_config->>'overnight_hour')::text || ' * * *';
  cleanup_cron_expr := '0 ' || (cleanup_config->>'overnight_hour')::text || ' * * *';
  
  -- Reschedule scraper if enabled (NOW USING ANON KEY - SECURITY FIX)
  IF (scraper_config->>'enabled')::boolean THEN
    PERFORM cron.unschedule('automated-scraper');
    PERFORM cron.schedule(
      'automated-scraper',
      scraper_cron_expr,
      'SELECT net.http_post(url:=''https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-scheduler'', headers:=''{\"Content-Type\": \"application/json\", \"Authorization\": \"Bearer ' || anon_key || '\"}'', body:=''{\"scheduled_run\": true, \"timezone_aware\": true}'')::jsonb;'
    );
  ELSE
    PERFORM cron.unschedule('automated-scraper');
  END IF;
  
  -- Reschedule cleanup if enabled
  IF (cleanup_config->>'enabled')::boolean THEN
    PERFORM cron.unschedule('daily-cleanup');
    PERFORM cron.schedule(
      'daily-cleanup',
      cleanup_cron_expr,
      'DELETE FROM newsletter_signup_rate_limits WHERE window_start < now() - INTERVAL ''24 hours''; DELETE FROM system_logs WHERE created_at < now() - INTERVAL ''30 days''; DELETE FROM scrape_jobs WHERE created_at < now() - INTERVAL ''7 days'';'
    );
  ELSE
    PERFORM cron.unschedule('daily-cleanup');
  END IF;
  
  -- Log the update
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Cron schedules updated with anon key (security fix applied)',
    jsonb_build_object(
      'scraper_schedule', scraper_cron_expr,
      'cleanup_schedule', cleanup_cron_expr,
      'scraper_enabled', (scraper_config->>'enabled')::boolean,
      'cleanup_enabled', (cleanup_config->>'enabled')::boolean,
      'security_fix', 'anon_key_migration'
    ),
    'update_cron_schedules'
  );
END;
$$;

-- Step 2: Update Job 11 (automated-scraper) to use anon key
SELECT cron.unschedule('automated-scraper');
SELECT cron.schedule(
  'automated-scraper',
  '0 2 * * *',
  $$SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-scheduler', 
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}',
    body:='{"scheduled_run": true, "timezone_aware": true}')::jsonb;$$
);

-- Step 3: Update Job 8 (queue-processor) to use anon key
SELECT cron.unschedule('process-content-generation-queue');
SELECT cron.schedule(
  'process-content-generation-queue',
  '* * * * *',
  $$SELECT net.http_post(
    url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/queue-processor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}',
    body:='{}')::jsonb;$$
);

-- Log the security fix
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Security fix applied: Removed leaked service_role token from cron jobs',
  jsonb_build_object(
    'fixed_function', 'update_cron_schedules',
    'fixed_jobs', ARRAY['automated-scraper', 'process-content-generation-queue'],
    'security_issue', 'leaked_service_role_jwt',
    'remediation', 'replaced_with_anon_key',
    'impact', 'zero_downtime_scraping_continues'
  ),
  'security_fix_migration'
);