-- Create storage bucket for temporary uploads if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'temp-uploads',
  'temp-uploads',
  false,
  20971520, -- 20MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop existing policies if they exist (ignore errors if they don't)
DROP POLICY IF EXISTS "Authenticated users can upload to temp-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read from temp-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from temp-uploads" ON storage.objects;

-- Create policies for temp-uploads bucket
-- Policy 1: Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload to temp-uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'temp-uploads');

-- Policy 2: Allow authenticated users to read files
CREATE POLICY "Authenticated users can read from temp-uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'temp-uploads');

-- Policy 3: Allow authenticated users to delete files
CREATE POLICY "Authenticated users can delete from temp-uploads"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'temp-uploads');