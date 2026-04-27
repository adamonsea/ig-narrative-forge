-- Restrict access to sensitive token/consent columns on topic_newsletter_signups.
-- The existing RLS policy already scopes rows to topic owners + admins, but exposes
-- verification_token, unsubscribe_token, and consent_ip_hash. These should never be
-- visible to topic owners — only the service role (used by edge functions) needs them.

REVOKE SELECT (verification_token, unsubscribe_token, consent_ip_hash, push_subscription)
  ON public.topic_newsletter_signups FROM anon, authenticated;

REVOKE INSERT (verification_token, unsubscribe_token, consent_ip_hash)
  ON public.topic_newsletter_signups FROM anon, authenticated;

REVOKE UPDATE (verification_token, unsubscribe_token, consent_ip_hash)
  ON public.topic_newsletter_signups FROM anon, authenticated;

-- Note: push_subscription may legitimately be set by authenticated users via
-- usePushSubscription hook (signed-in users managing their own browser push).
-- We allow INSERT/UPDATE on it but not SELECT-by-others (only service role reads it
-- when sending notifications).
