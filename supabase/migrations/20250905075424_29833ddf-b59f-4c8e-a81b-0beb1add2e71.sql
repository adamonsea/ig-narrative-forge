-- Create function to update cron schedules dynamically
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
  
  -- Reschedule scraper if enabled
  IF (scraper_config->>'enabled')::boolean THEN
    PERFORM cron.unschedule('automated-scraper');
    PERFORM cron.schedule(
      'automated-scraper',
      scraper_cron_expr,
      'SELECT net.http_post(url:=''https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-scheduler'', headers:=''{\"Content-Type\": \"application/json\", \"Authorization\": \"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.vQgVmLdy2_nu8EWq4TQfk8-jEIttI0d1Kht7Nsdv_v0\"}'', body:=''{"scheduled_run": true, "timezone_aware": true}'')::jsonb;'
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
    'Cron schedules updated',
    jsonb_build_object(
      'scraper_schedule', scraper_cron_expr,
      'cleanup_schedule', cleanup_cron_expr,
      'scraper_enabled', (scraper_config->>'enabled')::boolean,
      'cleanup_enabled', (cleanup_config->>'enabled')::boolean
    ),
    'update_cron_schedules'
  );
END;
$$;

-- Function for admins to update scheduler settings
CREATE OR REPLACE FUNCTION public.update_scheduler_setting(
  p_setting_key text,
  p_setting_value jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if user has admin role
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;
  
  -- Update the setting
  UPDATE scheduler_settings 
  SET setting_value = p_setting_value,
      updated_at = now()
  WHERE setting_key = p_setting_key;
  
  -- Update cron schedules if this was a scheduler setting
  IF p_setting_key IN ('scraper_schedule', 'cleanup_schedule') THEN
    PERFORM update_cron_schedules();
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Initialize the cron schedules
SELECT update_cron_schedules();