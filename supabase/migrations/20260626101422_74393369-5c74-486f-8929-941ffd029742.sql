
-- 1. VISUALS: require parent topic to be public + active for anon/public reads
DROP POLICY IF EXISTS "Public read: visuals of public stories" ON public.visuals;
DROP POLICY IF EXISTS "Public read: visuals of published stories" ON public.visuals;

CREATE POLICY "Public read: visuals of public topic stories"
ON public.visuals
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.slides sl
    JOIN public.stories s ON s.id = sl.story_id
    LEFT JOIN public.articles a ON a.id = s.article_id
    LEFT JOIN public.topic_articles ta ON ta.id = s.topic_article_id
    JOIN public.topics t ON t.id = COALESCE(a.topic_id, ta.topic_id)
    WHERE sl.id = visuals.slide_id
      AND (s.is_published = true OR s.status = 'published')
      AND t.is_public = true
      AND t.is_active = true
  )
);

-- 2. SHARED_ARTICLE_CONTENT: restrict read to authenticated users only
DROP POLICY IF EXISTS "Shared content readable by authenticated users" ON public.shared_article_content;

CREATE POLICY "Shared content readable by authenticated users"
ON public.shared_article_content
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- 3. ARTICLE_DUPLICATES: scope read to topic owner / admin
DROP POLICY IF EXISTS "Article duplicates viewable by authenticated users" ON public.article_duplicates;

CREATE POLICY "Article duplicates viewable by topic owner"
ON public.article_duplicates
FOR SELECT
TO authenticated
USING (
  (SELECT auth.role()) = 'service_role'
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.articles a
    JOIN public.topics t ON t.id = a.topic_id
    WHERE a.id = article_duplicates.original_article_id
      AND t.created_by = (SELECT auth.uid())
  )
);

-- 4. SUBSCRIBER_SCORES: add owner/admin read policy (RLS was enabled with no policy)
ALTER TABLE public.subscriber_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subscriber scores viewable by topic owner"
ON public.subscriber_scores
FOR SELECT
TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.topics t
    WHERE t.id = subscriber_scores.topic_id
      AND t.created_by = (SELECT auth.uid())
  )
);

-- 5. Lock down internal-only SECURITY DEFINER maintenance functions
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (
        p.proname LIKE 'cleanup_%'
        OR p.proname LIKE 'bulk_%'
        OR p.proname LIKE 'fix_%'
        OR p.proname LIKE 'emergency_%'
        OR p.proname LIKE 'backfill_%'
        OR p.proname LIKE 'purge_%'
        OR p.proname LIKE 'dedupe_%'
        OR p.proname LIKE 'reactivate_%'
        OR p.proname LIKE 'deactivate_%'
        OR p.proname LIKE 'recover_%'
        OR p.proname = 'archive_title_duplicates'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
  END LOOP;
END $$;
