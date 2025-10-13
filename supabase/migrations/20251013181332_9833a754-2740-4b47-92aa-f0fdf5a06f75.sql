-- Add donation configuration to topics table
ALTER TABLE public.topics 
ADD COLUMN IF NOT EXISTS donation_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS donation_config JSONB DEFAULT '{
  "button_text": "Support this feed",
  "tiers": []
}'::jsonb;

-- Update RLS policies to allow topic owners to manage donation settings
-- (existing policies already cover this, but we'll add a comment for clarity)
COMMENT ON COLUMN public.topics.donation_enabled IS 'Whether donation button is enabled for this topic';
COMMENT ON COLUMN public.topics.donation_config IS 'JSON config for donation tiers and button text';

-- Index for faster lookups of donation-enabled topics
CREATE INDEX IF NOT EXISTS idx_topics_donation_enabled ON public.topics(donation_enabled) WHERE donation_enabled = true;