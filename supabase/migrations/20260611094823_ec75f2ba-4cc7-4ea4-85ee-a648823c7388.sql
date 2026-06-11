
-- 1) article_duplicates_pending: scope to topic owner via original_article_id -> articles -> topics
DROP POLICY IF EXISTS "Duplicate detection manageable by authenticated users" ON public.article_duplicates_pending;
DROP POLICY IF EXISTS "Duplicate detection viewable by authenticated users" ON public.article_duplicates_pending;

CREATE POLICY "Pending duplicates viewable by topic owner"
ON public.article_duplicates_pending
FOR SELECT
TO authenticated
USING (
  ((SELECT auth.role()) = 'service_role')
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM articles a
    JOIN topics t ON t.id = a.topic_id
    WHERE a.id = article_duplicates_pending.original_article_id
      AND t.created_by = (SELECT auth.uid())
  )
);

CREATE POLICY "Pending duplicates manageable by topic owner"
ON public.article_duplicates_pending
FOR ALL
TO authenticated
USING (
  ((SELECT auth.role()) = 'service_role')
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM articles a
    JOIN topics t ON t.id = a.topic_id
    WHERE a.id = article_duplicates_pending.original_article_id
      AND t.created_by = (SELECT auth.uid())
  )
)
WITH CHECK (
  ((SELECT auth.role()) = 'service_role')
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM articles a
    JOIN topics t ON t.id = a.topic_id
    WHERE a.id = article_duplicates_pending.original_article_id
      AND t.created_by = (SELECT auth.uid())
  )
);

-- 2) image_generation_tests: scope to topic owner via story_id -> stories -> topics
DROP POLICY IF EXISTS "Image generation tests manageable by authenticated users" ON public.image_generation_tests;
DROP POLICY IF EXISTS "Image generation tests viewable by authenticated users" ON public.image_generation_tests;

CREATE POLICY "Image tests viewable by topic owner"
ON public.image_generation_tests
FOR SELECT
TO authenticated
USING (
  ((SELECT auth.role()) = 'service_role')
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = image_generation_tests.story_id
      AND (
        (s.article_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM articles a JOIN topics t ON t.id = a.topic_id
          WHERE a.id = s.article_id AND t.created_by = (SELECT auth.uid())))
        OR (s.topic_article_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM topic_articles ta JOIN topics t ON t.id = ta.topic_id
          WHERE ta.id = s.topic_article_id AND t.created_by = (SELECT auth.uid())))
      )
  )
);

CREATE POLICY "Image tests manageable by topic owner"
ON public.image_generation_tests
FOR ALL
TO authenticated
USING (
  ((SELECT auth.role()) = 'service_role')
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = image_generation_tests.story_id
      AND (
        (s.article_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM articles a JOIN topics t ON t.id = a.topic_id
          WHERE a.id = s.article_id AND t.created_by = (SELECT auth.uid())))
        OR (s.topic_article_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM topic_articles ta JOIN topics t ON t.id = ta.topic_id
          WHERE ta.id = s.topic_article_id AND t.created_by = (SELECT auth.uid())))
      )
  )
)
WITH CHECK (
  ((SELECT auth.role()) = 'service_role')
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = image_generation_tests.story_id
      AND (
        (s.article_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM articles a JOIN topics t ON t.id = a.topic_id
          WHERE a.id = s.article_id AND t.created_by = (SELECT auth.uid())))
        OR (s.topic_article_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM topic_articles ta JOIN topics t ON t.id = ta.topic_id
          WHERE ta.id = s.topic_article_id AND t.created_by = (SELECT auth.uid())))
      )
  )
);

-- 3) Pin search_path on 14 app-owned functions
ALTER FUNCTION public.cleanup_sentiment_cards_on_keyword_change() SET search_path = public;
ALTER FUNCTION public.generate_story_slug(title_text text, story_id uuid) SET search_path = public;
ALTER FUNCTION public.get_story_reaction_counts_batch(p_story_ids uuid[], p_visitor_id text, p_user_id uuid) SET search_path = public;
ALTER FUNCTION public.is_story_visible(story_updated_at timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.normalize_url_enhanced(input_url text) SET search_path = public;
ALTER FUNCTION public.prevent_source_deletion_if_linked() SET search_path = public;
ALTER FUNCTION public.safe_cleanup_inactive_sources() SET search_path = public;
ALTER FUNCTION public.set_story_published_at() SET search_path = public;
ALTER FUNCTION public.set_story_published_at_on_insert() SET search_path = public;
ALTER FUNCTION public.set_story_slug() SET search_path = public;
ALTER FUNCTION public.update_global_automation_settings_updated_at() SET search_path = public;
ALTER FUNCTION public.update_insight_cards_updated_at() SET search_path = public;
ALTER FUNCTION public.update_keyword_analytics_updated_at() SET search_path = public;
ALTER FUNCTION public.update_quiz_questions_updated_at() SET search_path = public;
