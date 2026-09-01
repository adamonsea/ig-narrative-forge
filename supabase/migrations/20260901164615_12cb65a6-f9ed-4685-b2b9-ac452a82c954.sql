GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_newsletter_signups TO authenticated;
GRANT ALL ON public.topic_newsletter_signups TO service_role;
GRANT SELECT ON public.subscriber_scores TO authenticated;
GRANT ALL ON public.subscriber_scores TO service_role;