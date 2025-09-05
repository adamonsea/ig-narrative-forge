-- Create scheduler settings table for admin configuration
CREATE TABLE IF NOT EXISTS public.scheduler_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  description text
);

-- Enable RLS
ALTER TABLE public.scheduler_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for scheduler settings
CREATE POLICY "Scheduler settings viewable by admins" 
ON public.scheduler_settings 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Scheduler settings manageable by admins" 
ON public.scheduler_settings 
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default scheduler settings
INSERT INTO public.scheduler_settings (setting_key, setting_value, description, created_by) 
VALUES 
  ('scraper_schedule', '{
    "frequency_hours": 24,
    "timezone": "UTC",
    "overnight_hour": 2,
    "enabled": true,
    "last_updated": null
  }', 'Main scraper automation schedule configuration', (SELECT user_id FROM user_roles WHERE role = ''superadmin'' LIMIT 1)),
  ('cleanup_schedule', '{
    "frequency_hours": 24,
    "timezone": "UTC", 
    "overnight_hour": 3,
    "enabled": true
  }', 'Database cleanup schedule configuration', (SELECT user_id FROM user_roles WHERE role = ''superadmin'' LIMIT 1))
ON CONFLICT (setting_key) DO NOTHING;

-- Drop existing cron jobs to recreate them with dynamic scheduling
SELECT cron.unschedule('automated-scraper');
SELECT cron.unschedule('daily-cleanup');

-- Create a function to dynamically update cron schedules based on settings
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
  -- Format: minute hour day month day_of_week
  scraper_cron_expr := '0 ' || (scraper_config->>'overnight_hour')::text || ' * * *'; -- Daily at specified hour
  cleanup_cron_expr := '0 ' || (cleanup_config->>'overnight_hour')::text || ' * * *'; -- Daily at specified hour
  
  -- Reschedule if enabled
  IF (scraper_config->>'enabled')::boolean THEN
    -- Unschedule existing job
    PERFORM cron.unschedule('automated-scraper');
    
    -- Schedule new job
    PERFORM cron.schedule(
      'automated-scraper',
      scraper_cron_expr,
      $$
      select
        net.http_post(
            url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-scheduler',
            headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.vQgVmLdy2_nu8EWq4TQfk8-jEIttI0d1Kht7Nsdv_v0"}'::jsonb,
            body:=concat('{"scheduled_run": true, "timezone_aware": true, "time": "', now(), '"}')::jsonb
        ) as request_id;
      $$
    );
  END IF;
  
  IF (cleanup_config->>'enabled')::boolean THEN
    -- Unschedule existing cleanup job
    PERFORM cron.unschedule('daily-cleanup');
    
    -- Schedule cleanup job
    PERFORM cron.schedule(
      'daily-cleanup',
      cleanup_cron_expr,
      $$
      -- Clean up old rate limits
      DELETE FROM newsletter_signup_rate_limits 
      WHERE window_start < now() - INTERVAL '24 hours';
      
      -- Clean up old system logs older than 30 days
      DELETE FROM system_logs 
      WHERE created_at < now() - INTERVAL '30 days';
      
      -- Clean up old scrape jobs older than 7 days
      DELETE FROM scrape_jobs 
      WHERE created_at < now() - INTERVAL '7 days';
      $$
    );
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

-- Create trigger to automatically update cron schedules when settings change
CREATE OR REPLACE FUNCTION public.trigger_update_cron_schedules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only trigger for scheduler-related settings
  IF NEW.setting_key IN ('scraper_schedule', 'cleanup_schedule') THEN
    -- Update the updated_at timestamp
    NEW.updated_at = now();
    
    -- Schedule the cron update to run after this transaction
    PERFORM pg_notify('update_cron_schedules', '');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on scheduler_settings
CREATE TRIGGER trigger_scheduler_settings_update
  BEFORE UPDATE ON scheduler_settings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_cron_schedules();

-- Run initial cron schedule setup
SELECT update_cron_schedules();