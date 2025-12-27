-- Add first_name field to topic_newsletter_signups
ALTER TABLE public.topic_newsletter_signups
ADD COLUMN IF NOT EXISTS first_name TEXT;

-- Add consent tracking for GDPR compliance
ALTER TABLE public.topic_newsletter_signups
ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS consent_ip_hash TEXT;

COMMENT ON COLUMN public.topic_newsletter_signups.first_name IS 'Subscriber first name for personalized communications';
COMMENT ON COLUMN public.topic_newsletter_signups.consent_given_at IS 'Timestamp when GDPR consent was given';
COMMENT ON COLUMN public.topic_newsletter_signups.consent_ip_hash IS 'Hashed IP address for consent audit trail';