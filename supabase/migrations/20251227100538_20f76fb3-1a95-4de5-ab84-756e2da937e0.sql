-- Add RSS and Email Subscription toggles to topics table
ALTER TABLE public.topics
ADD COLUMN IF NOT EXISTS rss_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS email_subscriptions_enabled BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.topics.rss_enabled IS 'Whether RSS feed is publicly available for this topic';
COMMENT ON COLUMN public.topics.email_subscriptions_enabled IS 'Whether email newsletter subscriptions are enabled for this topic';