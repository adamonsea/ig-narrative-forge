-- Add hashtags and source_attribution fields to support social media post generation
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS hashtags JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS source_attribution TEXT;

ALTER TABLE public.stories 
ADD COLUMN IF NOT EXISTS publication_name TEXT,
ADD COLUMN IF NOT EXISTS author TEXT;