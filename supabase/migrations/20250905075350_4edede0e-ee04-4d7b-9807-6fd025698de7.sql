-- Create scheduler settings table for admin configuration
CREATE TABLE IF NOT EXISTS public.scheduler_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
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
INSERT INTO public.scheduler_settings (setting_key, setting_value, description) 
VALUES 
  ('scraper_schedule', '{
    "frequency_hours": 24,
    "timezone": "UTC",
    "overnight_hour": 2,
    "enabled": true,
    "last_updated": null
  }', 'Main scraper automation schedule configuration'),
  ('cleanup_schedule', '{
    "frequency_hours": 24,
    "timezone": "UTC", 
    "overnight_hour": 3,
    "enabled": true
  }', 'Database cleanup schedule configuration')
ON CONFLICT (setting_key) DO NOTHING;