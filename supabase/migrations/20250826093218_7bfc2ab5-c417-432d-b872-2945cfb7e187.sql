-- Add unique constraint on story_id to carousel_exports table
ALTER TABLE public.carousel_exports 
ADD CONSTRAINT carousel_exports_story_id_unique UNIQUE (story_id);