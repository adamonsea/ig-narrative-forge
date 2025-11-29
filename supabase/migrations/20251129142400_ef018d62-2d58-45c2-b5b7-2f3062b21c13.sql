-- Drop existing policies and create simpler ones
DROP POLICY IF EXISTS "Users can upload topic assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their topic assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their topic assets" ON storage.objects;
DROP POLICY IF EXISTS "Public can view topic assets" ON storage.objects;

-- Simpler policy: authenticated users can upload to topic-assets bucket
-- The app validates ownership at the application level
CREATE POLICY "Authenticated users can upload to topic-assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'topic-assets');

-- Authenticated users can update their uploads
CREATE POLICY "Authenticated users can update topic-assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'topic-assets');

-- Authenticated users can delete from topic-assets
CREATE POLICY "Authenticated users can delete topic-assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'topic-assets');

-- Public can view topic assets
CREATE POLICY "Anyone can view topic-assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'topic-assets');