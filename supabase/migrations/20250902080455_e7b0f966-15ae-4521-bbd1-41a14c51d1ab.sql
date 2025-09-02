-- Create RLS policies for the exports bucket to allow users to access their carousel images

-- Allow users to view their own carousel exports
CREATE POLICY "Users can view their own carousel exports" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'exports' AND 
  (storage.foldername(name))[1] = 'carousels' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- Allow authenticated users to upload to their own folder in exports
CREATE POLICY "Users can upload to their own carousel folder" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'exports' AND 
  (storage.foldername(name))[1] = 'carousels' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- Allow users to update their own carousel exports  
CREATE POLICY "Users can update their own carousel exports" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'exports' AND 
  (storage.foldername(name))[1] = 'carousels' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- Allow users to delete their own carousel exports
CREATE POLICY "Users can delete their own carousel exports" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'exports' AND 
  (storage.foldername(name))[1] = 'carousels' AND
  auth.uid()::text = (storage.foldername(name))[2]
);