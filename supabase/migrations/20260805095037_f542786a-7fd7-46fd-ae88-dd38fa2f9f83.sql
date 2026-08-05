CREATE POLICY "Slides readable by story owners and admins"
ON public.slides
FOR SELECT
TO authenticated
USING (
  ((select auth.role()) = 'service_role')
  OR public.has_role((select auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.stories s
    JOIN public.articles a ON a.id = s.article_id
    JOIN public.topics t ON t.id = a.topic_id
    WHERE s.id = slides.story_id AND t.created_by = (select auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.stories s
    JOIN public.topic_articles ta ON ta.id = s.topic_article_id
    JOIN public.topics t ON t.id = ta.topic_id
    WHERE s.id = slides.story_id AND t.created_by = (select auth.uid())
  )
);