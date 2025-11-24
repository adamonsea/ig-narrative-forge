-- Rollback: Remove storage bucket restrictions
-- This reverts the file size limits and MIME type restrictions

UPDATE storage.buckets
SET 
  file_size_limit = NULL,
  allowed_mime_types = NULL
WHERE id IN (
  'visuals',
  'topic-logos',
  'topic-icons',
  'templates',
  'story-illustrations'
);