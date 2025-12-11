
-- =====================================================
-- FIX INSUFFICIENT RLS POLICIES
-- Adds WITH CHECK clauses and service_role access
-- =====================================================

-- 1. discarded_articles: Add WITH CHECK clause
DROP POLICY IF EXISTS "Topic owners can manage their discarded articles" ON public.discarded_articles;

CREATE POLICY "Topic owners can manage their discarded articles" 
ON public.discarded_articles
FOR ALL
USING (
  (topic_id IN (SELECT topics.id FROM topics WHERE topics.created_by = auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (auth.role() = 'service_role'::text)
)
WITH CHECK (
  (topic_id IN (SELECT topics.id FROM topics WHERE topics.created_by = auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (auth.role() = 'service_role'::text)
);

-- 2. sentiment_keyword_tracking: Add WITH CHECK clause and service_role
DROP POLICY IF EXISTS "Topic owners can manage keyword tracking" ON public.sentiment_keyword_tracking;

CREATE POLICY "Topic owners can manage keyword tracking" 
ON public.sentiment_keyword_tracking
FOR ALL
USING (
  (topic_id IN (SELECT topics.id FROM topics WHERE topics.created_by = auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (auth.role() = 'service_role'::text)
)
WITH CHECK (
  (topic_id IN (SELECT topics.id FROM topics WHERE topics.created_by = auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (auth.role() = 'service_role'::text)
);

-- 3. api_usage: Add WITH CHECK clause (already admin/service_role only)
DROP POLICY IF EXISTS "API usage admin and service role only" ON public.api_usage;

CREATE POLICY "API usage admin and service role only" 
ON public.api_usage
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (auth.role() = 'service_role'::text)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (auth.role() = 'service_role'::text)
);

-- 4. rate_limits: Add service_role access for edge functions
DROP POLICY IF EXISTS "Rate limits admin access" ON public.rate_limits;

CREATE POLICY "Rate limits admin and service role access" 
ON public.rate_limits
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (auth.role() = 'service_role'::text)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (auth.role() = 'service_role'::text)
);
