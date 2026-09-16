ALTER TABLE public.topic_articles
  ADD COLUMN IF NOT EXISTS held_at timestamptz,
  ADD COLUMN IF NOT EXISTS held_reason text;

CREATE INDEX IF NOT EXISTS idx_topic_articles_topic_status_created
  ON public.topic_articles (topic_id, processing_status, created_at DESC);