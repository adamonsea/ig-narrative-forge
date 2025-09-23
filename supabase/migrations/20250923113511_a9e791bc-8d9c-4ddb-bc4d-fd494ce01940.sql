-- Create global automation settings table
CREATE TABLE IF NOT EXISTS public.global_automation_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  scrape_frequency_hours INTEGER NOT NULL DEFAULT 12,
  auto_simplify_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_simplify_quality_threshold INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.global_automation_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own automation settings"
  ON public.global_automation_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_global_automation_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_global_automation_settings_updated_at
  BEFORE UPDATE ON public.global_automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_global_automation_settings_updated_at();

-- Add automation settings to topics table if not exists
ALTER TABLE public.topics 
ADD COLUMN IF NOT EXISTS auto_simplify_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS automation_quality_threshold INTEGER DEFAULT 60;