-- Create storage bucket for topic icons (PWA/favicon)
INSERT INTO storage.buckets (id, name, public)
VALUES ('topic-icons', 'topic-icons', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for topic logos (header branding)
INSERT INTO storage.buckets (id, name, public)
VALUES ('topic-logos', 'topic-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for topic-icons bucket
CREATE POLICY "Topic icons publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'topic-icons');

CREATE POLICY "Topic owners can upload icons"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'topic-icons'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  )
);

CREATE POLICY "Topic owners can update their icons"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'topic-icons'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  )
);

CREATE POLICY "Topic owners can delete their icons"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'topic-icons'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  )
);

-- RLS policies for topic-logos bucket
CREATE POLICY "Topic logos publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'topic-logos');

CREATE POLICY "Topic owners can upload logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'topic-logos'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  )
);

CREATE POLICY "Topic owners can update their logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'topic-logos'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  )
);

CREATE POLICY "Topic owners can delete their logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'topic-logos'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  )
);