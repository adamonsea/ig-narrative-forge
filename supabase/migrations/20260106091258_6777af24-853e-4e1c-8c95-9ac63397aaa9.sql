-- Remove overly permissive public INSERT policy
-- All newsletter signups should go through secure-newsletter-signup edge function
-- which uses service_role key and applies proper validation + rate limiting

DROP POLICY IF EXISTS "Anyone can sign up for newsletters" ON public.topic_newsletter_signups;
DROP POLICY IF EXISTS "Rate limited public newsletter signups" ON public.topic_newsletter_signups;
DROP POLICY IF EXISTS "Public can sign up for newsletters" ON public.topic_newsletter_signups;

-- Verify that service role policy exists for the edge function
-- This is already in place but let's ensure it covers INSERT explicitly
DROP POLICY IF EXISTS "Service role can manage newsletter signups" ON public.topic_newsletter_signups;

CREATE POLICY "Service role can manage newsletter signups"
ON public.topic_newsletter_signups
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Add a comment to the table documenting the security model
COMMENT ON TABLE public.topic_newsletter_signups IS 'Newsletter signups - all inserts must go through secure-newsletter-signup edge function which enforces rate limiting, email verification, and only allows public topics';