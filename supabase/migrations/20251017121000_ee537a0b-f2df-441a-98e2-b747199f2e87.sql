-- Phase 1: Upgrade to Web Push API
-- Add push subscription storage to newsletter signups
ALTER TABLE topic_newsletter_signups
ADD COLUMN IF NOT EXISTS push_subscription JSONB,
ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_push_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS push_failure_count INTEGER DEFAULT 0;

-- Create weekly digest tracking table
CREATE TABLE IF NOT EXISTS weekly_digest_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  recipient_count INTEGER NOT NULL,
  stories_included JSONB NOT NULL,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  delivery_method TEXT DEFAULT 'push' CHECK (delivery_method IN ('push', 'email', 'telegram')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_digest_history_topic ON weekly_digest_history(topic_id, sent_at DESC);

-- Enable RLS on weekly_digest_history
ALTER TABLE weekly_digest_history ENABLE ROW LEVEL SECURITY;

-- Allow topic owners to view their digest history
CREATE POLICY "Topic owners can view digest history"
ON weekly_digest_history
FOR SELECT
USING (
  topic_id IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Allow service role to manage digest history
CREATE POLICY "Service role can manage digest history"
ON weekly_digest_history
FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Add comment
COMMENT ON TABLE weekly_digest_history IS 'Tracks weekly digest deliveries with engagement metrics and story content';