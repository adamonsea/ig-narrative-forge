-- Phase 4.2: Restore Feed Visibility + Harden Queries
-- Add public (anon) read access for published content only

-- STORIES: Allow anon SELECT only for published stories
CREATE POLICY "Public read: published stories"
ON public.stories FOR SELECT TO anon
USING (status = 'published' OR is_published = true);

-- SLIDES: Allow anon SELECT for slides belonging to published stories
CREATE POLICY "Public read: slides of published stories"
ON public.slides FOR SELECT TO anon
USING (EXISTS (
  SELECT 1 FROM public.stories s
  WHERE s.id = slides.story_id
    AND (s.status = 'published' OR s.is_published = true)
));

-- VISUALS: Allow anon SELECT for visuals of published stories
CREATE POLICY "Public read: visuals of published stories"
ON public.visuals FOR SELECT TO anon
USING (EXISTS (
  SELECT 1
  FROM public.slides sl
  JOIN public.stories s ON s.id = sl.story_id
  WHERE sl.id = visuals.slide_id
    AND (s.status = 'published' OR s.is_published = true)
));

-- ARTICLES: Allow anon SELECT for articles referenced by published stories
CREATE POLICY "Public read: articles referenced by published stories"
ON public.articles FOR SELECT TO anon
USING (EXISTS (
  SELECT 1 FROM public.stories s
  WHERE s.article_id = articles.id
    AND (s.status = 'published' OR s.is_published = true)
));

-- Log the policy updates
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Phase 4.2: Added public read policies for published content',
  jsonb_build_object(
    'policies_added', 4,
    'scope', 'anon_read_published_only'
  ),
  'phase_4_2_public_read_policies'
);