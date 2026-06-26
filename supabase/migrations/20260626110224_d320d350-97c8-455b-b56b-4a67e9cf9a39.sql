-- 1. Articles: drop blanket public read
DROP POLICY IF EXISTS "Articles public access" ON public.articles;

-- 2. shared_article_content: restrict authenticated read to owned/public topics
DROP POLICY IF EXISTS "Shared content readable by authenticated users" ON public.shared_article_content;
CREATE POLICY "Shared content readable for owned or public topics"
ON public.shared_article_content
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topic_articles ta
    JOIN public.topics t ON t.id = ta.topic_id
    WHERE ta.shared_content_id = shared_article_content.id
      AND (
        t.created_by = (SELECT auth.uid())
        OR t.is_public = true
        OR has_role((SELECT auth.uid()), 'admin'::app_role)
      )
  )
);

-- 3. scrape_jobs: restrict INSERT to source-owning users / service role
DROP POLICY IF EXISTS "Authenticated users can create scrape jobs" ON public.scrape_jobs;
DROP POLICY IF EXISTS "Service role can manage scrape jobs" ON public.scrape_jobs;
CREATE POLICY "Users can create scrape jobs for their sources"
ON public.scrape_jobs
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.role()) = 'service_role'::text
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.content_sources cs
    JOIN public.topics t ON t.id = cs.topic_id
    WHERE cs.id = scrape_jobs.source_id
      AND t.created_by = (SELECT auth.uid())
  )
);

-- 4. article_duplicates: restrict INSERT to service role
DROP POLICY IF EXISTS "Article duplicates insert by authenticated" ON public.article_duplicates;
CREATE POLICY "Article duplicates insert by service role"
ON public.article_duplicates
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.role()) = 'service_role'::text
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
);

-- 5. storage temp-uploads: ownership path check on read & delete
DROP POLICY IF EXISTS "Authenticated users can read from temp-uploads" ON storage.objects;
CREATE POLICY "Users can read their own temp-uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'temp-uploads'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "Authenticated users can delete from temp-uploads" ON storage.objects;
CREATE POLICY "Users can delete their own temp-uploads"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'temp-uploads'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);