DROP POLICY IF EXISTS "Topic owners can read their topic visits" ON public.site_visits;

CREATE POLICY "Topic owners can read their topic visits"
ON public.site_visits
FOR SELECT
TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  OR (
    topic_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.topics t
      WHERE t.id = site_visits.topic_id
        AND t.created_by = (SELECT auth.uid())
    )
  )
);