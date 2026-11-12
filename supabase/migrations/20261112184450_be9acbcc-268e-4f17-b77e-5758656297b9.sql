GRANT UPDATE ON public.event_sources TO authenticated;

DROP POLICY IF EXISTS "Feed owners can update their events sources" ON public.event_sources;
CREATE POLICY "Feed owners can update their events sources"
ON public.event_sources
FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.topics t WHERE t.id = event_sources.topic_id AND t.created_by = (select auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.topics t WHERE t.id = event_sources.topic_id AND t.created_by = (select auth.uid())));

ALTER FUNCTION public.set_event_source_auto_publish(uuid, boolean) SECURITY INVOKER;