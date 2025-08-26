-- Add ai_provider column to content_generation_queue table
ALTER TABLE public.content_generation_queue 
ADD COLUMN IF NOT EXISTS ai_provider text DEFAULT 'deepseek' CHECK (ai_provider IN ('openai', 'deepseek'));