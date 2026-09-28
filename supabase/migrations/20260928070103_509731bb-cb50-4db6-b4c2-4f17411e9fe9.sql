ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS duplicate_of_story_id uuid REFERENCES public.stories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_similarity numeric;

CREATE INDEX IF NOT EXISTS idx_stories_duplicate_of ON public.stories(duplicate_of_story_id) WHERE duplicate_of_story_id IS NOT NULL;