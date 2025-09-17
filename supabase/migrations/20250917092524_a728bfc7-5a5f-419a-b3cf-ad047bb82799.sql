-- Create storage bucket for temporary file uploads
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('temp-uploads', 'temp-uploads', false, ARRAY['image/*', 'application/pdf', 'text/*'])
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for temp uploads
CREATE POLICY "Anyone can upload temp files"
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'temp-uploads');

CREATE POLICY "Anyone can read temp files"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'temp-uploads');

CREATE POLICY "Anyone can delete temp files"
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'temp-uploads');