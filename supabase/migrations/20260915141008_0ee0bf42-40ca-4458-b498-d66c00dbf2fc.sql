ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS house_style_notes text,
  ADD COLUMN IF NOT EXISTS house_style_examples text;