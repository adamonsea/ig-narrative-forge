-- Drop the overly restrictive policies I just created
DROP POLICY IF EXISTS "Stories viewable by region access only" ON public.stories;
DROP POLICY IF EXISTS "Slides viewable by region access only" ON public.slides;

-- Create proper policies that separate public read from admin access
-- Stories: Public can read published stories, but admin functions require ownership
CREATE POLICY "Published stories are publicly readable" 
ON public.stories 
FOR SELECT 
USING (
  -- Published stories are readable by everyone
  (is_published = true AND status = 'ready') OR
  -- Service role always has access
  (auth.role() = 'service_role'::text) OR
  -- Authenticated users can see their own content based on region/topic ownership
  (
    auth.uid() IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM articles a
        JOIN user_regions ur ON ur.region = a.region
        WHERE a.id = stories.article_id 
        AND ur.user_id = auth.uid()
      ) OR
      has_role(auth.uid(), 'admin'::app_role) OR
      EXISTS (
        SELECT 1 FROM articles a
        JOIN topics t ON t.id = a.topic_id
        WHERE a.id = stories.article_id 
        AND t.created_by = auth.uid()
      )
    )
  )
);

-- Stories: Admin operations restricted to owners only
CREATE POLICY "Stories manageable by owners only"
ON public.stories
FOR ALL
USING (
  (auth.role() = 'service_role'::text) OR
  (
    auth.uid() IS NOT NULL AND (
      -- Region owners can manage regional content
      EXISTS (
        SELECT 1 FROM articles a
        JOIN user_regions ur ON ur.region = a.region
        WHERE a.id = stories.article_id 
        AND ur.user_id = auth.uid()
      ) OR
      -- Admins can manage everything
      has_role(auth.uid(), 'admin'::app_role) OR
      -- Topic creators can manage their topic content
      EXISTS (
        SELECT 1 FROM articles a
        JOIN topics t ON t.id = a.topic_id
        WHERE a.id = stories.article_id 
        AND t.created_by = auth.uid()
      )
    )
  )
)
WITH CHECK (
  (auth.role() = 'service_role'::text) OR
  (
    auth.uid() IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM articles a
        JOIN user_regions ur ON ur.region = a.region
        WHERE a.id = stories.article_id 
        AND ur.user_id = auth.uid()
      ) OR
      has_role(auth.uid(), 'admin'::app_role) OR
      EXISTS (
        SELECT 1 FROM articles a
        JOIN topics t ON t.id = a.topic_id
        WHERE a.id = stories.article_id 
        AND t.created_by = auth.uid()
      )
    )
  )
);

-- Slides: Public can read slides from published stories
CREATE POLICY "Published slides are publicly readable"
ON public.slides
FOR SELECT
USING (
  -- Slides from published stories are readable by everyone
  EXISTS (
    SELECT 1 FROM stories s 
    WHERE s.id = slides.story_id 
    AND s.is_published = true 
    AND s.status = 'ready'
  ) OR
  -- Service role always has access
  (auth.role() = 'service_role'::text) OR
  -- Authenticated users can see their own content
  (
    auth.uid() IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM stories s
        JOIN articles a ON a.id = s.article_id
        JOIN user_regions ur ON ur.region = a.region
        WHERE s.id = slides.story_id 
        AND ur.user_id = auth.uid()
      ) OR
      has_role(auth.uid(), 'admin'::app_role) OR
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