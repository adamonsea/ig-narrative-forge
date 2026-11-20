ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS cover_original_url text,
  ADD COLUMN IF NOT EXISTS cover_framing jsonb;
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS image_original_path text,
  ADD COLUMN IF NOT EXISTS image_framing jsonb,
  ADD COLUMN IF NOT EXISTS image_edited boolean NOT NULL DEFAULT false;