-- Remove the overly permissive public read policy for stories
DROP POLICY IF EXISTS "Stories publicly readable" ON public.stories;

-- Remove the overly permissive public read policy for slides  
DROP POLICY IF EXISTS "Slides publicly readable" ON public.slides;

-- Update stories policy to properly restrict access
CREATE POLICY "Stories viewable by region access only" 
ON public.stories 
FOR SELECT 
USING (
  (auth.role() = 'service_role'::text) OR 
  (
    auth.uid() IS NOT NULL AND (
      -- Users with region access to the article's region
      EXISTS (
        SELECT 1 FROM articles a
        JOIN user_regions ur ON ur.region = a.region
        WHERE a.id = stories.article_id 
        AND ur.user_id = auth.uid()
      ) OR
      -- Admin users have access to everything
      has_role(auth.uid(), 'admin'::app_role) OR
      -- Topic creators have access to their topic content
      EXISTS (
        SELECT 1 FROM articles a
        JOIN topics t ON t.id = a.topic_id
        WHERE a.id = stories.article_id 
        AND t.created_by = auth.uid()
      )
    )
  )
);

-- Update slides policy to properly restrict access  
CREATE POLICY "Slides viewable by region access only"
ON public.slides
FOR SELECT
USING (
  (auth.role() = 'service_role'::text) OR
  (
    auth.uid() IS NOT NULL AND (
      -- Users with region access to the story's article region
      EXISTS (
        SELECT 1 FROM stories s
        JOIN articles a ON a.id = s.article_id
        JOIN user_regions ur ON ur.region = a.region
        WHERE s.id = slides.story_id 
        AND ur.user_id = auth.uid()
      ) OR
      -- Admin users have access to everything
      has_role(auth.uid(), 'admin'::app_role) OR
      -- Topic creators have access to their topic content
      EXISTS (
        SELECT 1 FROM stories s
        JOIN articles a ON a.id = s.article_id
        JOIN topics t ON t.id = a.topic_id
        WHERE s.id = slides.story_id 
        AND t.created_by = auth.uid()
      )
    )
  )
);