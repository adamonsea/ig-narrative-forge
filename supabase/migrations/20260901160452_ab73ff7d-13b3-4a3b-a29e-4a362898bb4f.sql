-- 1. Remove public read of newsletter signups
DROP POLICY IF EXISTS "Public can check signup existence" ON public.topic_newsletter_signups;

-- Safe existence check for a topic (no personal data returned)
CREATE OR REPLACE FUNCTION public.topic_has_active_signups(p_topic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.topic_newsletter_signups
    WHERE topic_id = p_topic_id AND is_active = true
  );
$$;

-- Status lookup for a single known email (no tokens returned)
CREATE OR REPLACE FUNCTION public.get_subscriber_status(p_topic_id uuid, p_email text)
RETURNS TABLE(notification_type text, email_verified boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.notification_type, s.email_verified
  FROM public.topic_newsletter_signups s
  WHERE s.topic_id = p_topic_id
    AND lower(s.email) = lower(p_email)
    AND s.email_verified = true
    AND s.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.topic_has_active_signups(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_subscriber_status(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.topic_has_active_signups(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscriber_status(uuid, text) TO anon, authenticated;

-- 2. Scope analytics reads to topic owners/admins
DROP POLICY IF EXISTS "Allow authenticated reads for analytics" ON public.feed_clicks;
CREATE POLICY "Topic owners can read their feed clicks"
ON public.feed_clicks FOR SELECT TO authenticated
USING (
  topic_id IN (SELECT id FROM public.topics WHERE created_by = (select auth.uid()))
  OR public.has_role((select auth.uid()), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Authenticated users can read ab test events" ON public.ab_test_events;
CREATE POLICY "Topic owners can read their ab test events"
ON public.ab_test_events FOR SELECT TO authenticated
USING (
  topic_id IN (SELECT id FROM public.topics WHERE created_by = (select auth.uid()))
  OR public.has_role((select auth.uid()), 'admin'::app_role)
);