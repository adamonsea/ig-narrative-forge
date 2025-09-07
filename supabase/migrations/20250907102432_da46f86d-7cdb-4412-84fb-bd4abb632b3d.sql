-- Fix RLS policies for gathering functionality - handle existing policies

-- 1. Fix system_logs table - add policy for authenticated users if it doesn't exist
DO $$
BEGIN
    -- Check if the policy exists, if not create it
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'system_logs' 
        AND policyname = 'Authenticated users can log events'
    ) THEN
        CREATE POLICY "Authenticated users can log events" 
        ON public.system_logs 
        FOR INSERT 
        WITH CHECK (auth.uid() IS NOT NULL);
    END IF;
END $$;

-- 2. Update scrape_jobs table policies
DROP POLICY IF EXISTS "Users can view scrape jobs for their topics" ON public.scrape_jobs;
DROP POLICY IF EXISTS "Service role can manage scrape jobs" ON public.scrape_jobs;

CREATE POLICY "Users can view scrape jobs for their topics" 
ON public.scrape_jobs 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM content_sources cs
      JOIN topics t ON t.id = cs.topic_id
      WHERE cs.id = scrape_jobs.source_id 
      AND t.created_by = auth.uid()
    ) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    auth.role() = 'service_role'::text
  )
);

CREATE POLICY "Service role can manage scrape jobs" 
ON public.scrape_jobs 
FOR INSERT 
WITH CHECK (auth.role() = 'service_role'::text OR auth.uid() IS NOT NULL);

-- 3. Update content_sources SELECT policy
DROP POLICY IF EXISTS "Content sources viewable by topic owners" ON public.content_sources;

CREATE POLICY "Content sources viewable by topic owners" 
ON public.content_sources 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    (topic_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM topics 
      WHERE topics.id = content_sources.topic_id 
      AND topics.created_by = auth.uid()
    )) OR
    (region IS NOT NULL AND EXISTS (
      SELECT 1 FROM user_regions 
      WHERE user_regions.user_id = auth.uid() 
      AND user_regions.region = content_sources.region
    )) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    auth.role() = 'service_role'::text
  )
);

-- 4. Update scraped_urls_history policies
DROP POLICY IF EXISTS "Users can manage scraped URL history for their topics" ON public.scraped_urls_history;

CREATE POLICY "Users can manage scraped URL history for their topics" 
ON public.scraped_urls_history 
FOR ALL 
USING (
  auth.uid() IS NOT NULL AND (
    (topic_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM topics 
      WHERE topics.id = scraped_urls_history.topic_id 
      AND topics.created_by = auth.uid()
    )) OR
    (source_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM content_sources cs
      JOIN topics t ON t.id = cs.topic_id
      WHERE cs.id = scraped_urls_history.source_id 
      AND t.created_by = auth.uid()
    )) OR
    has_role(auth.uid(), 'admin'::app_role) OR
    auth.role() = 'service_role'::text
  )
);