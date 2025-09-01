-- Fix storage bucket RLS policies for exports bucket
CREATE POLICY "Users can view their own carousel exports" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'exports' AND
  (storage.foldername(name))[1] = 'carousels' AND
  auth.uid() IS NOT NULL AND
  (
    -- Allow access to files in carousels/{story_id} if user has access to that story
    EXISTS (
      SELECT 1 FROM stories s
      JOIN articles a ON a.id = s.article_id
      JOIN user_regions ur ON ur.region = a.region
      WHERE ur.user_id = auth.uid()
      AND s.id::text = (storage.foldername(name))[2]
    )
    OR
    -- Allow access for topic-based stories
    EXISTS (
      SELECT 1 FROM stories s
      JOIN articles a ON a.id = s.article_id
      JOIN topics t ON t.id = a.topic_id
      WHERE t.created_by = auth.uid()
      AND s.id::text = (storage.foldername(name))[2]
    )
    OR
    -- Allow admins to access all
    has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Users can upload their own carousel exports" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'exports' AND
  (storage.foldername(name))[1] = 'carousels' AND
  auth.uid() IS NOT NULL AND
  (
    -- Allow upload to carousels/{story_id} if user has access to that story
    EXISTS (
      SELECT 1 FROM stories s
      JOIN articles a ON a.id = s.article_id
      JOIN user_regions ur ON ur.region = a.region
      WHERE ur.user_id = auth.uid()
      AND s.id::text = (storage.foldername(name))[2]
    )
    OR
    -- Allow upload for topic-based stories
    EXISTS (
      SELECT 1 FROM stories s
      JOIN articles a ON a.id = s.article_id
      JOIN topics t ON t.id = a.topic_id
      WHERE t.created_by = auth.uid()
      AND s.id::text = (storage.foldername(name))[2]
    )
    OR
    -- Allow admins to upload all
    has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Service role can manage carousel exports" 
ON storage.objects 
FOR ALL 
USING (
  bucket_id = 'exports' AND
  (storage.foldername(name))[1] = 'carousels' AND
  auth.role() = 'service_role'::text
);

-- Clean up orphaned carousel exports with invalid file paths
DELETE FROM carousel_exports 
WHERE status = 'failed' 
   OR (status = 'completed' AND (file_paths IS NULL OR file_paths = '[]'::jsonb));