-- Phase 4.3: Policy Alignment + Query Hardening

-- 1. Fix Policy Status Mismatch - Update slides policy to accept both 'ready' and 'published'
DROP POLICY IF EXISTS "Public read: slides for published stories" ON public.slides;
CREATE POLICY "Public read: slides for published stories" ON public.slides
FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM stories s 
  WHERE s.id = slides.story_id 
  AND (s.status IN ('ready', 'published')) 
  AND s.is_published = true
));

-- 2. Fix stories policy to accept both statuses consistently
DROP POLICY IF EXISTS "Public read: published stories only" ON public.stories;
CREATE POLICY "Public read: published stories only" ON public.stories
FOR SELECT TO anon, authenticated
USING ((status IN ('ready', 'published')) AND is_published = true);

-- 3. Fix visuals policy to accept both statuses
DROP POLICY IF EXISTS "Public read: visuals for published stories" ON public.visuals;
CREATE POLICY "Public read: visuals for published stories" ON public.visuals
FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM stories s 
  JOIN slides sl ON sl.story_id = s.id 
  WHERE sl.id = visuals.slide_id 
  AND (s.status IN ('ready', 'published')) 
  AND s.is_published = true
));

-- 4. Add missing authenticated policies for articles referenced by published stories
DROP POLICY IF EXISTS "Public read: articles referenced by published stories" ON public.articles;
CREATE POLICY "Public read: articles referenced by published stories" ON public.articles
FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM stories s 
  WHERE s.article_id = articles.id 
  AND (s.status IN ('ready', 'published')) 
  AND s.is_published = true
));

-- 5. Ensure posts are accessible for published stories
DROP POLICY IF EXISTS "Public read: posts for published stories" ON public.posts;
CREATE POLICY "Public read: posts for published stories" ON public.posts
FOR SELECT TO anon, authenticated  
USING (EXISTS (
  SELECT 1 FROM stories s 
  WHERE s.id = posts.story_id 
  AND (s.status IN ('ready', 'published')) 
  AND s.is_published = true
));