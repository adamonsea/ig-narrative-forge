-- Fix RLS policies for gathering functionality

-- 1. Fix system_logs table - allow authenticated users to log their own operations
DROP POLICY IF EXISTS "System logs admin access" ON public.system_logs;
DROP POLICY IF EXISTS "System logs service role access" ON public.system_logs;

CREATE POLICY "System logs service role access" 
ON public.system_logs 
FOR ALL 
USING (auth.role() = 'service_role'::text);

CREATE POLICY "System logs admin access" 
ON public.system_logs 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can log events" 
ON public.system_logs 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Fix scrape_jobs table - allow users to track their topic-related scraping jobs
DROP POLICY IF EXISTS "Scrape jobs admin access" ON public.scrape_jobs;
DROP POLICY IF EXISTS "Scrape jobs service role access" ON public.scrape_jobs;

CREATE POLICY "Scrape jobs service role access" 
ON public.scrape_jobs 
FOR ALL 
USING (auth.role() = 'service_role'::text);

CREATE POLICY "Scrape jobs admin access" 
ON public.scrape_jobs 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

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
    has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Service role can manage scrape jobs" 
ON public.scrape_jobs 
FOR INSERT 
WITH CHECK (auth.role() = 'service_role'::text OR auth.uid() IS NOT NULL);

-- 3. Ensure content_sources has proper SELECT access for topic owners
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
    has_role(auth.uid(), 'admin'::app_role)
  )
);

-- 4. Ensure users can insert scraped_urls_history for their gathering operations
DROP POLICY IF EXISTS "Authenticated users can insert scraped URL history" ON public.scraped_urls_history;
DROP POLICY IF EXISTS "Authenticated users can update scraped URL history" ON public.scraped_urls_history;
DROP POLICY IF EXISTS "Authenticated users can view scraped URL history" ON public.scraped_urls_history;

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