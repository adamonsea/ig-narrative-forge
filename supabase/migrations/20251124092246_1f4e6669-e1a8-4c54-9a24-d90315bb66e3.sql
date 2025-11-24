-- Add file size limits and MIME type restrictions to storage buckets
-- This prevents abuse while maintaining functionality for legitimate uploads

-- Buckets for small image assets: 5MB limit, images only
UPDATE storage.buckets 
SET 
  file_size_limit = 5242880,  -- 5MB
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
WHERE name IN ('visuals', 'topic-logos', 'topic-icons');

-- Templates bucket: 5MB limit, JSON and HTML only
UPDATE storage.buckets 
SET 
  file_size_limit = 5242880,  -- 5MB
  allowed_mime_types = ARRAY['text/html', 'application/json', 'text/plain']
WHERE name = 'templates';

-- Story illustrations: 20MB limit (accommodates existing 16.3MB files), images and videos
UPDATE storage.buckets 
SET 
  file_size_limit = 20971520,  -- 20MB
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'image/gif']
WHERE name = 'story-illustrations';