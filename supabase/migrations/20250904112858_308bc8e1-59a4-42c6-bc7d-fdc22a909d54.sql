-- Add public read access for articles associated with published stories
-- This allows public feeds to work while still protecting sensitive business data
CREATE POLICY "Articles readable for published stories"
ON public.articles
FOR SELECT
USING (
  -- Allow public access to articles that are linked to published stories
  EXISTS (
    SELECT 1 FROM stories s 
    WHERE s.article_id = articles.id 
    AND s.is_published = true 
    AND s.status = 'ready'
  )
);