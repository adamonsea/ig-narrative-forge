-- Add published_at timestamp to stories table
-- This will be set when is_published changes to true, providing accurate freshness tracking

ALTER TABLE public.stories 
ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Backfill existing published stories: use updated_at as best approximation
UPDATE public.stories 
SET published_at = updated_at 
WHERE is_published = true AND published_at IS NULL;

-- Create trigger to auto-set published_at when story is first published
CREATE OR REPLACE FUNCTION public.set_story_published_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set published_at when transitioning to published state for the first time
  IF NEW.is_published = true AND (OLD.is_published IS NULL OR OLD.is_published = false) AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS trigger_set_story_published_at ON public.stories;

CREATE TRIGGER trigger_set_story_published_at
BEFORE UPDATE ON public.stories
FOR EACH ROW
EXECUTE FUNCTION public.set_story_published_at();

-- Also handle INSERT case where story is created already published
CREATE OR REPLACE FUNCTION public.set_story_published_at_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_published = true AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_story_published_at_insert ON public.stories;

CREATE TRIGGER trigger_set_story_published_at_insert
BEFORE INSERT ON public.stories
FOR EACH ROW
EXECUTE FUNCTION public.set_story_published_at_on_insert();

-- Add index for efficient querying by published_at
CREATE INDEX IF NOT EXISTS idx_stories_published_at ON public.stories(published_at DESC) WHERE is_published = true;