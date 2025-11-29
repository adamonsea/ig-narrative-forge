-- Create storage bucket for topic assets (about page photos, logos, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('topic-assets', 'topic-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own topic folders
CREATE POLICY "Users can upload topic assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'topic-assets' AND
  EXISTS (
    SELECT 1 FROM public.topics
    WHERE topics.id::text = (storage.foldername(name))[1]
    AND topics.created_by = auth.uid()
  )
);

-- Allow authenticated users to update their own topic assets
CREATE POLICY "Users can update their topic assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'topic-assets' AND
  EXISTS (
    SELECT 1 FROM public.topics
    WHERE topics.id::text = (storage.foldername(name))[1]
    AND topics.created_by = auth.uid()
  )
);

-- Allow authenticated users to delete their own topic assets
CREATE POLICY "Users can delete their topic assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'topic-assets' AND
  EXISTS (
    SELECT 1 FROM public.topics
    WHERE topics.id::text = (storage.foldername(name))[1]
    AND topics.created_by = auth.uid()
  )
);

-- Allow anyone to view topic assets (public bucket)
CREATE POLICY "Public can view topic assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'topic-assets');