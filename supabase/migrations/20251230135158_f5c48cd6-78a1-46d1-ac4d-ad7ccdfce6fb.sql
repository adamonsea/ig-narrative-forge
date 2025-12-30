-- Add public widget builder toggle to topics
ALTER TABLE public.topics 
ADD COLUMN IF NOT EXISTS public_widget_builder_enabled boolean DEFAULT false;