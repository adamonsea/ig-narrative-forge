-- 1. quiz_responses: fix always-true SELECT
DROP POLICY IF EXISTS "Users can view their own responses" ON public.quiz_responses;
CREATE POLICY "Users can view their own responses"
ON public.quiz_responses FOR SELECT
USING (
  (user_id = (select auth.uid()))
  OR public.has_role((select auth.uid()), 'admin'::app_role)
);

-- 2. exports bucket: remove broad authenticated read/write
DROP POLICY IF EXISTS "Exports bucket authenticated access" ON storage.objects;
DROP POLICY IF EXISTS "Exports bucket authenticated write" ON storage.objects;

-- Fix ownership-scoped read policy (correct objects.name reference)
DROP POLICY IF EXISTS "Users can view their own carousel exports" ON storage.objects;
CREATE POLICY "Users can view their own carousel exports"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'exports'
  AND (storage.foldername(name))[1] = 'carousels'
  AND (select auth.uid()) IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM stories s
      JOIN articles a ON a.id = s.article_id
      JOIN user_regions ur ON ur.region = a.region
      WHERE ur.user_id = (select auth.uid())
        AND s.id::text = (storage.foldername(objects.name))[2]
    )
    OR EXISTS (
      SELECT 1 FROM stories s
      JOIN articles a ON a.id = s.article_id
      JOIN topics t ON t.id = a.topic_id
      WHERE t.created_by = (select auth.uid())
        AND s.id::text = (storage.foldername(objects.name))[2]
    )
    OR public.has_role((select auth.uid()), 'admin'::app_role)
  )
);

-- Fix ownership-scoped write policy (correct objects.name reference)
DROP POLICY IF EXISTS "Users can upload their own carousel exports" ON storage.objects;
CREATE POLICY "Users can upload their own carousel exports"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'exports'
  AND (storage.foldername(name))[1] = 'carousels'
  AND (select auth.uid()) IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM stories s
      JOIN articles a ON a.id = s.article_id
      JOIN user_regions ur ON ur.region = a.region
      WHERE ur.user_id = (select auth.uid())
        AND s.id::text = (storage.foldername(objects.name))[2]
    )
    OR EXISTS (
      SELECT 1 FROM stories s
      JOIN articles a ON a.id = s.article_id
      JOIN topics t ON t.id = a.topic_id
      WHERE t.created_by = (select auth.uid())
        AND s.id::text = (storage.foldername(objects.name))[2]
    )
    OR public.has_role((select auth.uid()), 'admin'::app_role)
  )
);

-- 3a. topic-assets: ownership-scoped writes (path = {topic_id}/...)
DROP POLICY IF EXISTS "Authenticated users can upload to topic-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update topic-assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete topic-assets" ON storage.objects;

CREATE POLICY "Topic owners can upload topic-assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'topic-assets'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  AND (
    public.user_has_topic_access(((storage.foldername(name))[1])::uuid, 'owner')
    OR public.has_role((select auth.uid()), 'admin'::app_role)
  )
);
CREATE POLICY "Topic owners can update topic-assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'topic-assets'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  AND (
    public.user_has_topic_access(((storage.foldername(name))[1])::uuid, 'owner')
    OR public.has_role((select auth.uid()), 'admin'::app_role)
  )
);
CREATE POLICY "Topic owners can delete topic-assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'topic-assets'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  AND (
    public.user_has_topic_access(((storage.foldername(name))[1])::uuid, 'owner')
    OR public.has_role((select auth.uid()), 'admin'::app_role)
  )
);

-- 3b. story-illustrations: admin-only writes (otherwise via service role)
DROP POLICY IF EXISTS "Authenticated users can upload illustrations" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update illustrations" ON storage.objects;

CREATE POLICY "Admins can upload illustrations"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'story-illustrations' AND public.has_role((select auth.uid()), 'admin'::app_role));
CREATE POLICY "Admins can update illustrations"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'story-illustrations' AND public.has_role((select auth.uid()), 'admin'::app_role));

-- 3c. audio-briefings: admin-only writes (otherwise via service role)
DROP POLICY IF EXISTS "Authenticated users can upload audio briefings" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update audio briefings" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete audio briefings" ON storage.objects;

CREATE POLICY "Admins can upload audio briefings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'audio-briefings' AND public.has_role((select auth.uid()), 'admin'::app_role));
CREATE POLICY "Admins can update audio briefings"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'audio-briefings' AND public.has_role((select auth.uid()), 'admin'::app_role));
CREATE POLICY "Admins can delete audio briefings"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'audio-briefings' AND public.has_role((select auth.uid()), 'admin'::app_role));

-- 3d. visuals: admin-only writes (otherwise via service role)
DROP POLICY IF EXISTS "Visuals bucket write access" ON storage.objects;
CREATE POLICY "Admins can write visuals"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'visuals' AND public.has_role((select auth.uid()), 'admin'::app_role));

-- 3e. templates: admin-only writes (otherwise via service role)
DROP POLICY IF EXISTS "Templates bucket write access" ON storage.objects;
CREATE POLICY "Admins can write templates"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'templates' AND public.has_role((select auth.uid()), 'admin'::app_role));