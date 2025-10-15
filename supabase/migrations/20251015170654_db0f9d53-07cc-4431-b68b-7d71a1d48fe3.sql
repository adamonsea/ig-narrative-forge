-- Drop old topic-logos policies and recreate with robust split_part logic
DROP POLICY IF EXISTS "topic_logo_insert" ON storage.objects;
DROP POLICY IF EXISTS "topic_logo_update" ON storage.objects;
DROP POLICY IF EXISTS "topic_logo_delete" ON storage.objects;
DROP POLICY IF EXISTS "Topic owners can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Topic owners can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Topic owners can delete logos" ON storage.objects;
DROP POLICY IF EXISTS "Upload topic logos" ON storage.objects;
DROP POLICY IF EXISTS "Update topic logos" ON storage.objects;
DROP POLICY IF EXISTS "Delete topic logos" ON storage.objects;

-- Recreate with split_part-based extraction and fully qualified function
CREATE POLICY "topic_logo_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'topic-logos'
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  AND public.user_has_topic_access(split_part(name, '/', 1)::uuid, 'editor')
);

CREATE POLICY "topic_logo_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'topic-logos'
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  AND public.user_has_topic_access(split_part(name, '/', 1)::uuid, 'editor')
)
WITH CHECK (
  bucket_id = 'topic-logos'
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  AND public.user_has_topic_access(split_part(name, '/', 1)::uuid, 'editor')
);

CREATE POLICY "topic_logo_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'topic-logos'
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  AND public.user_has_topic_access(split_part(name, '/', 1)::uuid, 'editor')
);

-- Ensure public read access exists
DROP POLICY IF EXISTS "topic_logos_public_read" ON storage.objects;
CREATE POLICY "topic_logos_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'topic-logos');