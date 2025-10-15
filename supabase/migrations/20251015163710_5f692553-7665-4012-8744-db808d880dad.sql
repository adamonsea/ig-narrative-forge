-- Clean up all existing topic-logos policies and recreate with correct multi-tenant logic
-- Drop all possible existing policies
DROP POLICY IF EXISTS "Topic owners can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Topic owners can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Topic owners can delete logos" ON storage.objects;
DROP POLICY IF EXISTS "Upload topic logos" ON storage.objects;
DROP POLICY IF EXISTS "Update topic logos" ON storage.objects;
DROP POLICY IF EXISTS "Delete topic logos" ON storage.objects;

-- Create correct multi-tenant policies using security definer function
CREATE POLICY "topic_logo_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'topic-logos'
  AND (storage.foldername(storage.objects.name))[1] ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  AND public.user_has_topic_access(((storage.foldername(storage.objects.name))[1])::uuid, 'editor')
);

CREATE POLICY "topic_logo_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'topic-logos'
  AND (storage.foldername(storage.objects.name))[1] ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  AND public.user_has_topic_access(((storage.foldername(storage.objects.name))[1])::uuid, 'editor')
)
WITH CHECK (
  bucket_id = 'topic-logos'
  AND (storage.foldername(storage.objects.name))[1] ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  AND public.user_has_topic_access(((storage.foldername(storage.objects.name))[1])::uuid, 'editor')
);

CREATE POLICY "topic_logo_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'topic-logos'
  AND (storage.foldername(storage.objects.name))[1] ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  AND public.user_has_topic_access(((storage.foldername(storage.objects.name))[1])::uuid, 'editor')
);