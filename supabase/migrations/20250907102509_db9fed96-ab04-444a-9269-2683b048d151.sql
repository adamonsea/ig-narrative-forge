-- Fix RLS policies for gathering functionality (avoiding naming conflicts)

-- 1. Fix system_logs table - allow authenticated users to log their own operations
DROP POLICY IF EXISTS "Authenticated users can log events" ON public.system_logs;
DROP POLICY IF EXISTS "System logs insert by authenticated" ON public.system_logs;

CREATE POLICY "System logs insert by authenticated users" 
ON public.system_logs 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Fix scrape_jobs table - allow users to track their topic-related scraping jobs
CREATE POLICY "Topic owners can view their scrape jobs" 
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

CREATE POLICY "Authenticated users can create scrape jobs" 
ON public.scrape_jobs 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL OR auth.role() = 'service_role'::text);

-- 3. Ensure content_sources has proper SELECT access for topic owners
CREATE POLICY "Topic creators can view their sources" 
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

-- 4. Ensure users can manage scraped_urls_history for their gathering operations
CREATE POLICY "Topic owners can manage scraped URLs" 
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