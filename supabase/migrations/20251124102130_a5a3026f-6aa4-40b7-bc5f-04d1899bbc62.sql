-- Re-apply storage bucket security restrictions
-- File size limits and MIME type filters for content safety

UPDATE storage.buckets
SET 
  file_size_limit = 10485760, -- 10MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
WHERE id = 'visuals';

UPDATE storage.buckets
SET 
  file_size_limit = 5242880, -- 5MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp']
WHERE id = 'topic-logos';

UPDATE storage.buckets
SET 
  file_size_limit = 2097152, -- 2MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp']
WHERE id = 'topic-icons';

UPDATE storage.buckets
SET 
  file_size_limit = 10485760, -- 10MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
WHERE id = 'templates';

UPDATE storage.buckets
SET 
  file_size_limit = 10485760, -- 10MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
WHERE id = 'story-illustrations';