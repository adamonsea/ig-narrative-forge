-- Story covers: owners pick between the split cover and the full-bleed cover
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS story_cover_style text NOT NULL DEFAULT 'split'
    CHECK (story_cover_style IN ('split','full-bleed'));