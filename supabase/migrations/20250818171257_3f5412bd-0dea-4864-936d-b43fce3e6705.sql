-- Add missing visual_prompt field to slides table if it doesn't exist
ALTER TABLE public.slides 
ADD COLUMN IF NOT EXISTS visual_prompt TEXT;