ALTER TABLE public.topic_newsletter_signups
  ADD COLUMN IF NOT EXISTS signup_source text NOT NULL DEFAULT 'feed',
  ADD COLUMN IF NOT EXISTS source_domain text;

CREATE INDEX IF NOT EXISTS idx_topic_newsletter_signups_topic_source
  ON public.topic_newsletter_signups (topic_id, signup_source);