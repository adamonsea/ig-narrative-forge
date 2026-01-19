-- Create widget-avatars storage bucket for public widget avatar uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'widget-avatars',
  'widget-avatars',
  true,
  524288, -- 500KB limit
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to widget avatars
CREATE POLICY "Widget avatars are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'widget-avatars');

-- Uploads are handled via edge function (service role), so no insert policy needed for anon