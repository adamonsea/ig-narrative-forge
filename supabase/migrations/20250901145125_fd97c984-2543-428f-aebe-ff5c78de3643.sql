-- Update RLS policies to make all active feeds public

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Topics viewable by creators, admins, and public topics" ON public.topics;
DROP POLICY IF EXISTS "Published stories are publicly readable" ON public.stories;
DROP POLICY IF EXISTS "Published slides are publicly readable" ON public.slides;

-- Create new public access policies for topics (all active topics are viewable)
CREATE POLICY "All active topics are publicly viewable"
ON public.topics
FOR SELECT
USING (is_active = true);

-- Keep management policies for authenticated users
CREATE POLICY "Topic creators and admins can manage topics"
ON public.topics
FOR ALL
USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));

-- Create public access policy for published stories
CREATE POLICY "All published stories are publicly viewable"
ON public.stories
FOR SELECT
USING ((is_published = true) AND (status = 'ready'));

-- Keep management policies for stories
CREATE POLICY "Story creators and admins can manage stories"
ON public.stories
FOR ALL
USING ((auth.role() = 'service_role'::text) OR ((auth.uid() IS NOT NULL) AND ((EXISTS ( SELECT 1 FROM (articles a JOIN topics t ON ((t.id = a.topic_id))) WHERE ((a.id = stories.article_id) AND (t.created_by = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role))))
WITH CHECK ((auth.role() = 'service_role'::text) OR ((auth.uid() IS NOT NULL) AND ((EXISTS ( SELECT 1 FROM (articles a JOIN topics t ON ((t.id = a.topic_id))) WHERE ((a.id = stories.article_id) AND (t.created_by = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role))));

-- Create public access policy for slides from published stories
CREATE POLICY "All slides from published stories are publicly viewable"
ON public.slides
FOR SELECT
USING (EXISTS ( SELECT 1 FROM stories s WHERE ((s.id = slides.story_id) AND (s.is_published = true) AND (s.status = 'ready'))));