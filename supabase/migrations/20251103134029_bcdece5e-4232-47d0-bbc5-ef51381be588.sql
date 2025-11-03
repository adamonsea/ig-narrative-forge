-- Create storage bucket for story illustrations (static images and animated videos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'story-illustrations',
  'story-illustrations',
  true,
  52428800, -- 50MB limit
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4']
);

-- Allow authenticated users to upload illustrations
CREATE POLICY "Authenticated users can upload illustrations"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'story-illustrations');

-- Allow authenticated users to update their illustrations
CREATE POLICY "Authenticated users can update illustrations"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'story-illustrations');

-- Allow public read access to all illustrations
CREATE POLICY "Public read access to illustrations"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'story-illustrations');