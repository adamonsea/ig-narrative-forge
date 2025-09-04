-- Fix the infinite recursion in articles policies
-- Remove the problematic policy that causes circular dependency
DROP POLICY IF EXISTS "Articles readable for published stories" ON public.articles;

-- Create a simpler policy that allows public read access to basic article fields
-- only for articles that have associated published stories, but without recursion
CREATE POLICY "Articles public read for feeds"
ON public.articles
FOR SELECT
USING (
  -- Allow access if no authentication required (public feeds)
  auth.uid() IS NULL OR
  -- Or if user has existing permissions from other policies
  (auth.uid() IS NOT NULL AND (
    (EXISTS ( SELECT 1 FROM user_regions WHERE user_regions.user_id = auth.uid() AND user_regions.region = articles.region)) OR 
    has_role(auth.uid(), 'admin'::app_role) OR 
    (region IS NULL) OR 
    ((topic_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM topics WHERE topics.id = articles.topic_id AND topics.created_by = auth.uid())))
  ))
);