-- Fix the overly permissive articles table policies
-- Remove the dangerous policy that allows any authenticated user full access
DROP POLICY IF EXISTS "Articles manageable by authenticated users" ON public.articles;

-- Add specific restrictive policies for different operations
CREATE POLICY "Articles insert by service role and authorized users"
ON public.articles
FOR INSERT
WITH CHECK (
  auth.role() = 'service_role' OR
  has_role(auth.uid(), 'admin'::app_role) OR
  (topic_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM topics 
    WHERE topics.id = articles.topic_id 
    AND topics.created_by = auth.uid()
  ))
);

CREATE POLICY "Articles update by service role and authorized users"
ON public.articles
FOR UPDATE
USING (
  auth.role() = 'service_role' OR
  has_role(auth.uid(), 'admin'::app_role) OR
  (topic_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM topics 
    WHERE topics.id = articles.topic_id 
    AND topics.created_by = auth.uid()
  )) OR
  (region IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_regions 
    WHERE user_regions.user_id = auth.uid() 
    AND user_regions.region = articles.region
  ))
);

CREATE POLICY "Articles delete by service role and admins only"
ON public.articles
FOR DELETE
USING (
  auth.role() = 'service_role' OR
  has_role(auth.uid(), 'admin'::app_role)
);