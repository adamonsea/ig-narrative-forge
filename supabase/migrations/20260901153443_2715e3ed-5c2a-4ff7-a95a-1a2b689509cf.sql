-- Optimize RLS on topic_articles: wrap auth functions in subqueries so they
-- evaluate once per statement instead of once per row.
DROP POLICY IF EXISTS "Topic articles manageable by topic owners" ON public.topic_articles;
CREATE POLICY "Topic articles manageable by topic owners"
ON public.topic_articles
FOR ALL
USING (
  (topic_id IN (SELECT t.id FROM public.topics t WHERE t.created_by = (SELECT auth.uid())))
  OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR ((SELECT auth.role()) = 'service_role')
)
WITH CHECK (
  (topic_id IN (SELECT t.id FROM public.topics t WHERE t.created_by = (SELECT auth.uid())))
  OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR ((SELECT auth.role()) = 'service_role')
);

DROP POLICY IF EXISTS "Topic articles viewable by topic owners" ON public.topic_articles;
CREATE POLICY "Topic articles viewable by topic owners"
ON public.topic_articles
FOR SELECT
USING (
  (topic_id IN (SELECT t.id FROM public.topics t WHERE t.created_by = (SELECT auth.uid())))
  OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR ((SELECT auth.role()) = 'service_role')
);

-- Support the suppression trigger's lookup path
CREATE INDEX IF NOT EXISTS idx_shared_article_content_normalized_url
  ON public.shared_article_content (normalized_url);
