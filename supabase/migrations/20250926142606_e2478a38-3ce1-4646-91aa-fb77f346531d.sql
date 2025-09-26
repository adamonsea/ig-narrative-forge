-- Create public storage bucket for topic logos and RLS policies for secure uploads
-- Bucket: topic-logos (public read)

-- 1) Ensure bucket exists and is public
insert into storage.buckets (id, name, public)
values ('topic-logos', 'topic-logos', true)
on conflict (id) do update set public = true;

-- 2) Policies on storage.objects for bucket 'topic-logos'
-- Public read (anyone can SELECT objects from this bucket)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read topic-logos'
  ) THEN
    CREATE POLICY "Public read topic-logos"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'topic-logos');
  END IF;
END $$;

-- Allow authenticated users with editor/owner rights on the topic to upload into paths like "<topic_id>/logo.png"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Upload topic logos'
  ) THEN
    CREATE POLICY "Upload topic logos"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'topic-logos'
      AND ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$')
      AND public.user_has_topic_access(((storage.foldername(name))[1])::uuid, 'editor')
    );
  END IF;
END $$;

-- Allow replace/update by same topic editors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Update topic logos'
  ) THEN
    CREATE POLICY "Update topic logos"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'topic-logos'
      AND ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$')
      AND public.user_has_topic_access(((storage.foldername(name))[1])::uuid, 'editor')
    )
    WITH CHECK (
      bucket_id = 'topic-logos'
      AND ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$')
      AND public.user_has_topic_access(((storage.foldername(name))[1])::uuid, 'editor')
    );
  END IF;
END $$;

-- Allow deletion by same topic editors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Delete topic logos'
  ) THEN
    CREATE POLICY "Delete topic logos"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'topic-logos'
      AND ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$')
      AND public.user_has_topic_access(((storage.foldername(name))[1])::uuid, 'editor')
    );
  END IF;
END $$;

-- 3) Ensure topic editors can update branding_config on topics
alter table if exists public.topics enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'topics' AND policyname = 'Update branding by topic editors'
  ) THEN
    CREATE POLICY "Update branding by topic editors"
    ON public.topics
    FOR UPDATE
    TO authenticated
    USING (public.user_has_topic_access(id, 'editor'))
    WITH CHECK (public.user_has_topic_access(id, 'editor'));
  END IF;
END $$;