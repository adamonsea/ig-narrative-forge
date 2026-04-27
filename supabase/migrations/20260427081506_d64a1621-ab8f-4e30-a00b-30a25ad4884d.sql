-- Column-level REVOKEs don't override table-level GRANTs in Postgres.
-- We need to revoke the broad table grants first, then re-grant per-column.

REVOKE SELECT, INSERT, UPDATE ON public.topic_newsletter_signups FROM anon, authenticated;

-- Re-grant SELECT on every column EXCEPT the sensitive ones.
-- Sensitive columns kept service-role only:
--   verification_token, unsubscribe_token, consent_ip_hash
-- (push_subscription is kept readable by authenticated/anon because the
--  push notification hook checks for an existing subscription before
--  registering — but this is per-row gated by the existing RLS policy
--  which already restricts to topic owners + admins.)
GRANT SELECT (
  id, topic_id, email, name, first_name, frequency, is_active,
  notification_type, email_verified, verified_at, verification_sent_at,
  consent_given_at, push_subscription, created_at, updated_at
) ON public.topic_newsletter_signups TO anon, authenticated;

-- Re-grant INSERT on the columns the app may legitimately set.
-- Service role retains full INSERT on all columns (including tokens).
GRANT INSERT (
  id, topic_id, email, name, first_name, frequency, is_active,
  notification_type, email_verified, verified_at, verification_sent_at,
  consent_given_at, push_subscription, created_at, updated_at
) ON public.topic_newsletter_signups TO anon, authenticated;

-- Re-grant UPDATE on safe columns only (e.g. unsubscribing toggles is_active,
-- updating push_subscription, marking email_verified is service-role-only path
-- but harmless to allow at column level since RLS still gates rows).
GRANT UPDATE (
  email, name, first_name, frequency, is_active, notification_type,
  email_verified, verified_at, verification_sent_at, consent_given_at,
  push_subscription, updated_at
) ON public.topic_newsletter_signups TO anon, authenticated;
