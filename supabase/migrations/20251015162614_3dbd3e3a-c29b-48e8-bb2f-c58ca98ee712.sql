-- Fix topic-logos storage policies for proper multi-tenant access
-- Drop existing broken policies
DROP POLICY IF EXISTS "Topic owners can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Topic owners can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Topic owners can delete logos" ON storage.objects;
DROP POLICY IF EXISTS "Delete topic logos" ON storage.objects;

-- Create correct multi-tenant policies
-- Policy 1: Any authenticated user can upload logos for topics they own
CREATE POLICY "Topic owners can upload logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'topic-logos'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM topics
    WHERE topics.id = ((storage.foldername(name))[1])::uuid
    AND topics.created_by = auth.uid()
  )
);

-- Policy 2: Topic owners can update their logos
CREATE POLICY "Topic owners can update logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'topic-logos'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM topics
    WHERE topics.id = ((storage.foldername(name))[1])::uuid
    AND topics.created_by = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'topic-logos'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM topics
    WHERE topics.id = ((storage.foldername(name))[1])::uuid
    AND topics.created_by = auth.uid()
  )
);

-- Policy 3: Topic owners can delete their logos
CREATE POLICY "Topic owners can delete logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'topic-logos'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM topics
    WHERE topics.id = ((storage.foldername(name))[1])::uuid
    AND topics.created_by = auth.uid()
  )
);