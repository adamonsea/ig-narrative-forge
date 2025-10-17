-- Drop existing table if it exists
DROP TABLE IF EXISTS public.topic_newsletter_signups CASCADE;

-- Create newsletter signups table with push notification support
CREATE TABLE public.topic_newsletter_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  push_subscription JSONB,
  frequency TEXT NOT NULL DEFAULT 'weekly',
  is_active BOOLEAN NOT NULL DEFAULT true,
  verification_token TEXT,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(topic_id, email)
);

-- Enable RLS
ALTER TABLE public.topic_newsletter_signups ENABLE ROW LEVEL SECURITY;

-- Allow public inserts (anyone can sign up)
CREATE POLICY "Anyone can sign up for newsletters"
ON public.topic_newsletter_signups
FOR INSERT
WITH CHECK (true);

-- Topic owners can view their signups
CREATE POLICY "Topic owners can view their newsletter signups"
ON public.topic_newsletter_signups
FOR SELECT
USING (
  topic_id IN (
    SELECT id FROM public.topics 
    WHERE created_by = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Topic owners can update their signups
CREATE POLICY "Topic owners can update their newsletter signups"
ON public.topic_newsletter_signups
FOR UPDATE
USING (
  topic_id IN (
    SELECT id FROM public.topics 
    WHERE created_by = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Service role full access
CREATE POLICY "Service role can manage newsletter signups"
ON public.topic_newsletter_signups
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create indexes for faster lookups
CREATE INDEX idx_newsletter_signups_topic_id ON public.topic_newsletter_signups(topic_id);
CREATE INDEX idx_newsletter_signups_email ON public.topic_newsletter_signups(email);
CREATE INDEX idx_newsletter_signups_verified ON public.topic_newsletter_signups(verified_at) WHERE verified_at IS NOT NULL;