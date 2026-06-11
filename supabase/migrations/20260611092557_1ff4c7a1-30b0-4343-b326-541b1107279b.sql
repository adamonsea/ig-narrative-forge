DROP POLICY IF EXISTS "Quality reports manageable by authenticated users" ON public.quality_reports;
DROP POLICY IF EXISTS "Quality reports viewable by authenticated users" ON public.quality_reports;

CREATE POLICY "Quality reports viewable by story owner"
ON public.quality_reports
FOR SELECT
TO authenticated
USING (
  ((SELECT auth.role()) = 'service_role')
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = quality_reports.story_id
      AND (
        (s.article_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.articles a
          JOIN public.topics t ON t.id = a.topic_id
          WHERE a.id = s.article_id AND t.created_by = (SELECT auth.uid())
        ))
        OR (s.topic_article_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.topic_articles ta
          JOIN public.topics t ON t.id = ta.topic_id
          WHERE ta.id = s.topic_article_id AND t.created_by = (SELECT auth.uid())
        ))
      )
  )
);

CREATE POLICY "Quality reports manageable by story owner"
ON public.quality_reports
FOR ALL
TO authenticated
USING (
  ((SELECT auth.role()) = 'service_role')
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = quality_reports.story_id
      AND (
        (s.article_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.articles a
          JOIN public.topics t ON t.id = a.topic_id
          WHERE a.id = s.article_id AND t.created_by = (SELECT auth.uid())
        ))
        OR (s.topic_article_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.topic_articles ta
          JOIN public.topics t ON t.id = ta.topic_id
          WHERE ta.id = s.topic_article_id AND t.created_by = (SELECT auth.uid())
        ))
      )
  )
)
WITH CHECK (
  ((SELECT auth.role()) = 'service_role')
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = quality_reports.story_id
      AND (
        (s.article_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.articles a
          JOIN public.topics t ON t.id = a.topic_id
          WHERE a.id = s.article_id AND t.created_by = (SELECT auth.uid())
        ))
        OR (s.topic_article_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.topic_articles ta
          JOIN public.topics t ON t.id = ta.topic_id
          WHERE ta.id = s.topic_article_id AND t.created_by = (SELECT auth.uid())
        ))
      )
  )
);