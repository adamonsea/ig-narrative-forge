-- Remove broad public SELECT (listing) policies on public storage buckets.
-- Files remain reachable via the public /object/public/ CDN endpoint, which bypasses RLS.
-- This only removes the ability to ENUMERATE/LIST filenames via the storage API.

DROP POLICY IF EXISTS "Anyone can view topic-assets" ON storage.objects;
DROP POLICY IF EXISTS "Audio briefings are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to illustrations" ON storage.objects;
DROP POLICY IF EXISTS "Public read topic-logos" ON storage.objects;
DROP POLICY IF EXISTS "Templates bucket read access" ON storage.objects;
DROP POLICY IF EXISTS "Topic icons publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Topic logo public access" ON storage.objects;
DROP POLICY IF EXISTS "Topic logos publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Visuals bucket read access" ON storage.objects;
DROP POLICY IF EXISTS "Widget avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "topic_logo_public_read" ON storage.objects;
DROP POLICY IF EXISTS "topic_logos_public_read" ON storage.objects;