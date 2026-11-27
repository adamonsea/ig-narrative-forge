CREATE OR REPLACE FUNCTION public.reader_can_access_feed(p_topic_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT (select auth.role())='service_role' OR EXISTS(SELECT 1 FROM topics t WHERE t.id=p_topic_id AND NOT coalesce(t.is_archived,false) AND ((t.is_public AND t.is_active) OR t.created_by=(select auth.uid()) OR has_role((select auth.uid()),'admin') OR has_role((select auth.uid()),'superadmin')))
$$;
REVOKE ALL ON FUNCTION public.reader_can_access_feed(uuid) FROM PUBLIC,anon,authenticated;
DO $migration$
DECLARE f record; d text; guard text;
BEGIN
 FOR f IN SELECT oid,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('get_topic_stories_with_keywords','get_stories_unified') LOOP
  d:=pg_get_functiondef(f.oid);
  guard:=E'BEGIN\n IF p_topic_id IS NULL THEN\n   IF (select auth.role()) IS DISTINCT FROM ''service_role'' AND NOT coalesce(public.has_role((select auth.uid()),''admin''),false) AND NOT coalesce(public.has_role((select auth.uid()),''superadmin''),false) THEN RETURN; END IF;\n ELSIF NOT coalesce(public.reader_can_access_feed(p_topic_id),false) THEN RETURN; END IF;';
  IF position('reader_can_access_feed' in d)=0 THEN EXECUTE regexp_replace(d,'BEGIN',guard); END IF;
 END LOOP;
END $migration$;