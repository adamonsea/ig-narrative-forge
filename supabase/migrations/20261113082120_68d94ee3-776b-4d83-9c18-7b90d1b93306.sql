ALTER TABLE public.topic_insight_settings
  ADD COLUMN IF NOT EXISTS reader_event_submissions boolean NOT NULL DEFAULT false;