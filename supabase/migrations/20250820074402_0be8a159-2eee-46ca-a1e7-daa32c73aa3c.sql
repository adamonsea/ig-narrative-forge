-- Add missing image_data column to visuals table
ALTER TABLE public.visuals ADD COLUMN IF NOT EXISTS image_data text;

-- Add generation_prompt column to visuals table for tracking prompts
ALTER TABLE public.visuals ADD COLUMN IF NOT EXISTS generation_prompt text;