-- Add illustration_primary_color column to topics table
-- This stores the primary color for story illustrations in HSL format (e.g. "210 100% 50%")
ALTER TABLE public.topics 
ADD COLUMN IF NOT EXISTS illustration_primary_color TEXT DEFAULT '217 91% 60%';

-- Add comment to explain the format
COMMENT ON COLUMN public.topics.illustration_primary_color IS 'Primary color for illustrations in HSL format (hue saturation% lightness%) e.g. "210 100% 50%"';