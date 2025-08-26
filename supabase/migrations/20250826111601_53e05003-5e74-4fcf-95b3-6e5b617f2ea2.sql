-- Fix the articles RLS policy to work correctly
DROP POLICY IF EXISTS "Articles viewable by region access" ON public.articles;

-- Create a simpler, working policy for articles
CREATE POLICY "Articles viewable by authenticated users with region access" 
ON public.articles 
FOR SELECT 
USING (
  -- Allow authenticated users to see articles from their assigned regions
  auth.uid() IS NOT NULL AND (
    -- Check if user has access to this article's region
    EXISTS (
      SELECT 1 FROM public.user_regions 
      WHERE user_id = auth.uid() 
      AND region = articles.region
    )
    -- OR user is admin
    OR has_role(auth.uid(), 'admin'::app_role)
    -- OR article has no region (legacy articles)
    OR articles.region IS NULL
  )
);