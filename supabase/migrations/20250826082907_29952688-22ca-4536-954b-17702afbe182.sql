-- Check and fix storage bucket permissions for carousel exports
-- First ensure the exports bucket exists and is properly configured
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('exports', 'exports', false, 52428800, ARRAY['image/png', 'image/jpeg', 'application/zip'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'application/zip'];

-- Create storage policies for carousel exports
-- Users can view their own carousel exports
CREATE POLICY "Users can view carousel exports" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'exports' AND true);

-- Authenticated users can upload carousel exports
CREATE POLICY "Authenticated users can upload carousel exports" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'exports' AND auth.role() = 'authenticated');

-- Service role can manage all exports
CREATE POLICY "Service role can manage all exports" 
ON storage.objects 
FOR ALL 
USING (bucket_id = 'exports' AND auth.role() = 'service_role');