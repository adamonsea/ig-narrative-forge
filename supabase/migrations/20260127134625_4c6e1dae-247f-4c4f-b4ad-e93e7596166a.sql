-- Add video/mp4 mime type to story-illustrations bucket for animated covers
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4']
WHERE name = 'story-illustrations';

-- Also increase file size limit to 50MB to accommodate videos
UPDATE storage.buckets 
SET file_size_limit = 52428800  -- 50MB
WHERE name = 'story-illustrations';