-- Fix security issue: Implement proper region-based access control for sensitive tables
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Stories viewable by authenticated users" ON public.stories;
DROP POLICY IF EXISTS "Stories manageable by authenticated users" ON public.stories;
DROP POLICY IF EXISTS "Stories insert by authenticated" ON public.stories;
DROP POLICY IF EXISTS "Stories update by authenticated" ON public.stories;
DROP POLICY IF EXISTS "Stories delete by authenticated" ON public.stories;

DROP POLICY IF EXISTS "Slides viewable by authenticated users" ON public.slides;
DROP POLICY IF EXISTS "Slides manageable by authenticated users" ON public.slides;
DROP POLICY IF EXISTS "Slides insert by authenticated" ON public.slides;
DROP POLICY IF EXISTS "Slides update by authenticated" ON public.slides;
DROP POLICY IF EXISTS "Slides delete by authenticated" ON public.slides;

DROP POLICY IF EXISTS "Visuals viewable by authenticated users" ON public.visuals;
DROP POLICY IF EXISTS "Visuals manageable by authenticated users" ON public.visuals;
DROP POLICY IF EXISTS "Visuals insert by authenticated" ON public.visuals;
DROP POLICY IF EXISTS "Visuals update by authenticated" ON public.visuals;
DROP POLICY IF EXISTS "Visuals delete by authenticated" ON public.visuals;

DROP POLICY IF EXISTS "Posts viewable by authenticated users" ON public.posts;
DROP POLICY IF EXISTS "Posts manageable by authenticated users" ON public.posts;
DROP POLICY IF EXISTS "Posts insert by authenticated" ON public.posts;
DROP POLICY IF EXISTS "Posts update by authenticated" ON public.posts;
DROP POLICY IF EXISTS "Posts delete by authenticated" ON public.posts;

DROP POLICY IF EXISTS "Content generation queue manageable by authenticated users" ON public.content_generation_queue;

-- Create secure region-based policies for stories
CREATE POLICY "Stories viewable by region access" 
ON public.stories 
FOR SELECT 
USING (
  -- Service role has full access
  auth.role() = 'service_role'::text
  OR (
    -- Authenticated users can see stories from their assigned regions
    auth.uid() IS NOT NULL AND (
      -- Check if user has access to the article's region
      EXISTS (
        SELECT 1 FROM public.articles a
        JOIN public.user_regions ur ON ur.region = a.region
        WHERE a.id = stories.article_id
        AND ur.user_id = auth.uid()
      )
      -- OR user is admin
      OR has_role(auth.uid(), 'admin'::app_role)
      -- OR article has no region (legacy articles)
      OR EXISTS (
        SELECT 1 FROM public.articles a
        WHERE a.id = stories.article_id
        AND a.region IS NULL
      )
    )
  )
);

CREATE POLICY "Stories manageable by region access" 
ON public.stories 
FOR ALL 
USING (
  -- Service role has full access
  auth.role() = 'service_role'::text
  OR (
    -- Authenticated users can manage stories from their assigned regions
    auth.uid() IS NOT NULL AND (
      -- Check if user has access to the article's region
      EXISTS (
        SELECT 1 FROM public.articles a
        JOIN public.user_regions ur ON ur.region = a.region
        WHERE a.id = stories.article_id
        AND ur.user_id = auth.uid()
      )
      -- OR user is admin
      OR has_role(auth.uid(), 'admin'::app_role)
      -- OR article has no region (legacy articles)
      OR EXISTS (
        SELECT 1 FROM public.articles a
        WHERE a.id = stories.article_id
        AND a.region IS NULL
      )
    )
  )
);

-- Create secure region-based policies for slides
CREATE POLICY "Slides viewable by region access" 
ON public.slides 
FOR SELECT 
USING (
  -- Service role has full access
  auth.role() = 'service_role'::text
  OR (
    -- Authenticated users can see slides from their assigned regions
    auth.uid() IS NOT NULL AND (
      -- Check if user has access to the article's region via story
      EXISTS (
        SELECT 1 FROM public.stories s
        JOIN public.articles a ON a.id = s.article_id
        JOIN public.user_regions ur ON ur.region = a.region
        WHERE s.id = slides.story_id
        AND ur.user_id = auth.uid()
      )
      -- OR user is admin
      OR has_role(auth.uid(), 'admin'::app_role)
      -- OR article has no region (legacy articles)
      OR EXISTS (
        SELECT 1 FROM public.stories s
        JOIN public.articles a ON a.id = s.article_id
        WHERE s.id = slides.story_id
        AND a.region IS NULL
      )
    )
  )
);

CREATE POLICY "Slides manageable by region access" 
ON public.slides 
FOR ALL 
USING (
  -- Service role has full access
  auth.role() = 'service_role'::text
  OR (
    -- Authenticated users can manage slides from their assigned regions
    auth.uid() IS NOT NULL AND (
      -- Check if user has access to the article's region via story
      EXISTS (
        SELECT 1 FROM public.stories s
        JOIN public.articles a ON a.id = s.article_id
        JOIN public.user_regions ur ON ur.region = a.region
        WHERE s.id = slides.story_id
        AND ur.user_id = auth.uid()
      )
      -- OR user is admin
      OR has_role(auth.uid(), 'admin'::app_role)
      -- OR article has no region (legacy articles)
      OR EXISTS (
        SELECT 1 FROM public.stories s
        JOIN public.articles a ON a.id = s.article_id
        WHERE s.id = slides.story_id
        AND a.region IS NULL
      )
    )
  )
);

-- Create secure region-based policies for visuals
CREATE POLICY "Visuals viewable by region access" 
ON public.visuals 
FOR SELECT 
USING (
  -- Service role has full access
  auth.role() = 'service_role'::text
  OR (
    -- Authenticated users can see visuals from their assigned regions
    auth.uid() IS NOT NULL AND (
      -- Check if user has access to the article's region via slide and story
      EXISTS (
        SELECT 1 FROM public.slides sl
        JOIN public.stories s ON s.id = sl.story_id
        JOIN public.articles a ON a.id = s.article_id
        JOIN public.user_regions ur ON ur.region = a.region
        WHERE sl.id = visuals.slide_id
        AND ur.user_id = auth.uid()
      )
      -- OR user is admin
      OR has_role(auth.uid(), 'admin'::app_role)
      -- OR article has no region (legacy articles)
      OR EXISTS (
        SELECT 1 FROM public.slides sl
        JOIN public.stories s ON s.id = sl.story_id
        JOIN public.articles a ON a.id = s.article_id
        WHERE sl.id = visuals.slide_id
        AND a.region IS NULL
      )
    )
  )
);

CREATE POLICY "Visuals manageable by region access" 
ON public.visuals 
FOR ALL 
USING (
  -- Service role has full access
  auth.role() = 'service_role'::text
  OR (
    -- Authenticated users can manage visuals from their assigned regions
    auth.uid() IS NOT NULL AND (
      -- Check if user has access to the article's region via slide and story
      EXISTS (
        SELECT 1 FROM public.slides sl
        JOIN public.stories s ON s.id = sl.story_id
        JOIN public.articles a ON a.id = s.article_id
        JOIN public.user_regions ur ON ur.region = a.region
        WHERE sl.id = visuals.slide_id
        AND ur.user_id = auth.uid()
      )
      -- OR user is admin
      OR has_role(auth.uid(), 'admin'::app_role)
      -- OR article has no region (legacy articles)
      OR EXISTS (
        SELECT 1 FROM public.slides sl
        JOIN public.stories s ON s.id = sl.story_id
        JOIN public.articles a ON a.id = s.article_id
        WHERE sl.id = visuals.slide_id
        AND a.region IS NULL
      )
    )
  )
);

-- Create secure region-based policies for posts
CREATE POLICY "Posts viewable by region access" 
ON public.posts 
FOR SELECT 
USING (
  -- Service role has full access
  auth.role() = 'service_role'::text
  OR (
    -- Authenticated users can see posts from their assigned regions
    auth.uid() IS NOT NULL AND (
      -- Check if user has access to the article's region via story
      EXISTS (
        SELECT 1 FROM public.stories s
        JOIN public.articles a ON a.id = s.article_id
        JOIN public.user_regions ur ON ur.region = a.region
        WHERE s.id = posts.story_id
        AND ur.user_id = auth.uid()
      )
      -- OR user is admin
      OR has_role(auth.uid(), 'admin'::app_role)
      -- OR article has no region (legacy articles)
      OR EXISTS (
        SELECT 1 FROM public.stories s
        JOIN public.articles a ON a.id = s.article_id
        WHERE s.id = posts.story_id
        AND a.region IS NULL
      )
    )
  )
);

CREATE POLICY "Posts manageable by region access" 
ON public.posts 
FOR ALL 
USING (
  -- Service role has full access
  auth.role() = 'service_role'::text
  OR (
    -- Authenticated users can manage posts from their assigned regions
    auth.uid() IS NOT NULL AND (
      -- Check if user has access to the article's region via story
      EXISTS (
        SELECT 1 FROM public.stories s
        JOIN public.articles a ON a.id = s.article_id
        JOIN public.user_regions ur ON ur.region = a.region
        WHERE s.id = posts.story_id
        AND ur.user_id = auth.uid()
      )
      -- OR user is admin
      OR has_role(auth.uid(), 'admin'::app_role)
      -- OR article has no region (legacy articles)
      OR EXISTS (
        SELECT 1 FROM public.stories s
        JOIN public.articles a ON a.id = s.article_id
        WHERE s.id = posts.story_id
        AND a.region IS NULL
      )
    )
  )
);

-- Create secure region-based policies for content_generation_queue
CREATE POLICY "Content generation queue viewable by region access" 
ON public.content_generation_queue 
FOR SELECT 
USING (
  -- Service role has full access
  auth.role() = 'service_role'::text
  OR (
    -- Authenticated users can see queue items from their assigned regions
    auth.uid() IS NOT NULL AND (
      -- Check if user has access to the article's region
      EXISTS (
        SELECT 1 FROM public.articles a
        JOIN public.user_regions ur ON ur.region = a.region
        WHERE a.id = content_generation_queue.article_id
        AND ur.user_id = auth.uid()
      )
      -- OR user is admin
      OR has_role(auth.uid(), 'admin'::app_role)
      -- OR article has no region (legacy articles)
      OR EXISTS (
        SELECT 1 FROM public.articles a
        WHERE a.id = content_generation_queue.article_id
        AND a.region IS NULL
      )
    )
  )
);

CREATE POLICY "Content generation queue manageable by region access" 
ON public.content_generation_queue 
FOR ALL 
USING (
  -- Service role has full access
  auth.role() = 'service_role'::text
  OR (
    -- Authenticated users can manage queue items from their assigned regions
    auth.uid() IS NOT NULL AND (
      -- Check if user has access to the article's region
      EXISTS (
        SELECT 1 FROM public.articles a
        JOIN public.user_regions ur ON ur.region = a.region
        WHERE a.id = content_generation_queue.article_id
        AND ur.user_id = auth.uid()
      )
      -- OR user is admin
      OR has_role(auth.uid(), 'admin'::app_role)
      -- OR article has no region (legacy articles)
      OR EXISTS (
        SELECT 1 FROM public.articles a
        WHERE a.id = content_generation_queue.article_id
        AND a.region IS NULL
      )
    )
  )
);