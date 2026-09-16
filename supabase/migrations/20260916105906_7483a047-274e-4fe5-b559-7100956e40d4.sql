-- 1. articles SELECT: remove blanket region IS NULL bypass
DROP POLICY IF EXISTS "Articles viewable by authenticated users with region access" ON public.articles;
CREATE POLICY "Articles viewable by authenticated users with region access"
ON public.articles FOR SELECT TO authenticated
USING (
  has_role((select auth.uid()), 'admin'::app_role)
  OR ((region IS NOT NULL) AND EXISTS (
    SELECT 1 FROM public.user_regions ur
    WHERE ur.user_id = (select auth.uid()) AND ur.region = articles.region))
  OR ((topic_id IS NOT NULL) AND EXISTS (
    SELECT 1 FROM public.topics t
    WHERE t.id = articles.topic_id AND t.created_by = (select auth.uid())))
);

-- 2. content pipeline ALL policies: remove article.region IS NULL bypass
DROP POLICY IF EXISTS "Content generation queue manageable by region access" ON public.content_generation_queue;
CREATE POLICY "Content generation queue manageable by region access"
ON public.content_generation_queue FOR ALL
USING (
  (select auth.role()) = 'service_role'
  OR has_role((select auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.articles a
    JOIN public.user_regions ur ON ur.region = a.region
    WHERE a.id = content_generation_queue.article_id AND ur.user_id = (select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.articles a
    JOIN public.topics t ON t.id = a.topic_id
    WHERE a.id = content_generation_queue.article_id AND t.created_by = (select auth.uid()))
);

DROP POLICY IF EXISTS "Posts manageable by region access" ON public.posts;
CREATE POLICY "Posts manageable by region access"
ON public.posts FOR ALL
USING (
  (select auth.role()) = 'service_role'
  OR has_role((select auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.stories s
    JOIN public.articles a ON a.id = s.article_id
    JOIN public.user_regions ur ON ur.region = a.region
    WHERE s.id = posts.story_id AND ur.user_id = (select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.stories s
    JOIN public.articles a ON a.id = s.article_id
    JOIN public.topics t ON t.id = a.topic_id
    WHERE s.id = posts.story_id AND t.created_by = (select auth.uid()))
);

DROP POLICY IF EXISTS "Visuals manageable by region access" ON public.visuals;
CREATE POLICY "Visuals manageable by region access"
ON public.visuals FOR ALL
USING (
  (select auth.role()) = 'service_role'
  OR has_role((select auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.slides sl
    JOIN public.stories s ON s.id = sl.story_id
    JOIN public.articles a ON a.id = s.article_id
    JOIN public.user_regions ur ON ur.region = a.region
    WHERE sl.id = visuals.slide_id AND ur.user_id = (select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.slides sl
    JOIN public.stories s ON s.id = sl.story_id
    JOIN public.articles a ON a.id = s.article_id
    JOIN public.topics t ON t.id = a.topic_id
    WHERE sl.id = visuals.slide_id AND t.created_by = (select auth.uid()))
);

-- 3. feature_flags: admins / service role only
DROP POLICY IF EXISTS "Feature flags read by authenticated" ON public.feature_flags;
CREATE POLICY "Feature flags read by admins"
ON public.feature_flags FOR SELECT TO authenticated
USING (
  has_role((select auth.uid()), 'admin'::app_role)
  OR has_role((select auth.uid()), 'superadmin'::app_role)
);

-- 4. source_health_checks: drop hardcoded email bypass
DROP POLICY IF EXISTS "Owner and admins read all source health" ON public.source_health_checks;
CREATE POLICY "Admins read all source health"
ON public.source_health_checks FOR SELECT TO authenticated
USING (
  has_role((select auth.uid()), 'admin'::app_role)
  OR has_role((select auth.uid()), 'superadmin'::app_role)
);