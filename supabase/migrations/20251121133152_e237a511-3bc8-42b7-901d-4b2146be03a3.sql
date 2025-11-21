-- Add slug column to stories table for human-readable URLs
ALTER TABLE public.stories 
ADD COLUMN IF NOT EXISTS slug text;

-- Create unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS stories_slug_key ON public.stories(slug) WHERE slug IS NOT NULL;

-- Function to generate URL-safe slug from title
CREATE OR REPLACE FUNCTION generate_story_slug(title_text text, story_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter int := 0;
BEGIN
  -- Convert title to lowercase, replace spaces and special chars with hyphens
  base_slug := lower(regexp_replace(title_text, '[^a-zA-Z0-9]+', '-', 'g'));
  -- Remove leading/trailing hyphens
  base_slug := trim(both '-' from base_slug);
  -- Limit length to 60 characters
  base_slug := left(base_slug, 60);
  
  final_slug := base_slug;
  
  -- Check for uniqueness and append counter if needed
  WHILE EXISTS (SELECT 1 FROM stories WHERE slug = final_slug AND id != story_id) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$;

-- Populate slugs for existing stories
UPDATE public.stories
SET slug = generate_story_slug(title, id)
WHERE slug IS NULL AND title IS NOT NULL;

-- Trigger to auto-generate slug on insert/update
CREATE OR REPLACE FUNCTION set_story_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slug IS NULL AND NEW.title IS NOT NULL THEN
    NEW.slug := generate_story_slug(NEW.title, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stories_slug_trigger ON public.stories;
CREATE TRIGGER stories_slug_trigger
  BEFORE INSERT OR UPDATE OF title ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION set_story_slug();