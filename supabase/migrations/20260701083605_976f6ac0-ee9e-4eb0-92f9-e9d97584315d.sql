-- 1. content_sources: remove overly-broad authenticated read
DROP POLICY IF EXISTS "Content sources basic read for authenticated users" ON public.content_sources;

-- 2. source_attributions: restrict public read to topic owners / admins / service role
DROP POLICY IF EXISTS "Source attributions read access" ON public.source_attributions;
CREATE POLICY "Source attributions read for owners and admins"
ON public.source_attributions
FOR SELECT
USING (
  (auth.role() = 'service_role')
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.articles a
    JOIN public.topics t ON t.id = a.topic_id
    WHERE a.id = source_attributions.article_id
      AND t.created_by = (SELECT auth.uid())
  )
);

-- 3. story_impressions: restrict read to topic owners / admins (inserts unchanged)
DROP POLICY IF EXISTS "Anyone can read story impressions" ON public.story_impressions;
CREATE POLICY "Topic owners and admins can read story impressions"
ON public.story_impressions
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.topics t
    WHERE t.id = story_impressions.topic_id
      AND t.created_by = (SELECT auth.uid())
  )
);

-- 4. subscriber_scores: hide email column from topic owners (analytics remain)
REVOKE SELECT ON public.subscriber_scores FROM authenticated;
REVOKE SELECT ON public.subscriber_scores FROM anon;
GRANT SELECT (id, topic_id, total_swipes, like_count, best_streak, sessions_played, last_played_at, created_at, updated_at)
  ON public.subscriber_scores TO authenticated;

-- 5. topic_newsletter_signups: hide verification/unsubscribe tokens from topic owners
REVOKE SELECT ON public.topic_newsletter_signups FROM authenticated;
REVOKE SELECT ON public.topic_newsletter_signups FROM anon;
GRANT SELECT (id, topic_id, email, name, push_subscription, frequency, is_active, verified_at, created_at, updated_at, notification_type, email_verified, verification_sent_at, first_name, consent_given_at, consent_ip_hash)
  ON public.topic_newsletter_signups TO authenticated;

-- 6. temp-uploads: enforce per-user folder ownership on upload
DROP POLICY IF EXISTS "Authenticated users can upload to temp-uploads" ON storage.objects;
CREATE POLICY "Authenticated users can upload to their temp-uploads folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'temp-uploads'
  AND (storage.foldername(name))[1] = ((SELECT auth.uid()))::text
);