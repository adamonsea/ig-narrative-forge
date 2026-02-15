
ALTER TABLE topic_newsletter_signups
  ADD COLUMN IF NOT EXISTS unsubscribe_token uuid DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_newsletter_unsubscribe_token
  ON topic_newsletter_signups(unsubscribe_token);
