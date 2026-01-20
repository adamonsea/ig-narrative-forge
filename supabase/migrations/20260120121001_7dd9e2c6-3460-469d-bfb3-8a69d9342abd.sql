-- =============================================
-- PHASE 1: ADD OPTIMIZED RLS POLICIES (NON-BREAKING)
-- These policies use (select auth.uid()) to evaluate once per query
-- instead of per-row, improving performance by 50-90%
-- =============================================

-- Articles: Optimized INSERT policy
CREATE POLICY "articles_insert_optimized" ON articles
FOR INSERT TO authenticated
WITH CHECK (
  (select auth.role()) = 'service_role' 
  OR public.has_role((select auth.uid()), 'admin')
  OR (
    topic_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM topics 
      WHERE topics.id = articles.topic_id 
      AND topics.created_by = (select auth.uid())
    )
  )
);

-- Articles: Optimized UPDATE policy
CREATE POLICY "articles_update_optimized" ON articles
FOR UPDATE TO authenticated
USING (
  (select auth.role()) = 'service_role' 
  OR public.has_role((select auth.uid()), 'admin')
  OR (topic_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM topics 
    WHERE topics.id = articles.topic_id 
    AND topics.created_by = (select auth.uid())
  ))
  OR (region IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_regions 
    WHERE user_regions.user_id = (select auth.uid()) 
    AND user_regions.region = articles.region
  ))
);

-- Stories: Optimized management policy (consolidated from duplicates)
CREATE POLICY "stories_manage_optimized" ON stories
FOR ALL TO authenticated
USING (
  (select auth.role()) = 'service_role'
  OR public.has_role((select auth.uid()), 'admin')
  OR (
    article_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM articles a
      JOIN topics t ON t.id = a.topic_id
      WHERE a.id = stories.article_id 
      AND t.created_by = (select auth.uid())
    )
  )
  OR (
    topic_article_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM topic_articles ta
      JOIN topics t ON t.id = ta.topic_id
      WHERE ta.id = stories.topic_article_id 
      AND t.created_by = (select auth.uid())
    )
  )
)
WITH CHECK (
  (select auth.role()) = 'service_role'
  OR public.has_role((select auth.uid()), 'admin')
  OR (
    article_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM articles a
      JOIN topics t ON t.id = a.topic_id
      WHERE a.id = stories.article_id 
      AND t.created_by = (select auth.uid())
    )
  )
  OR (
    topic_article_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM topic_articles ta
      JOIN topics t ON t.id = ta.topic_id
      WHERE ta.id = stories.topic_article_id 
      AND t.created_by = (select auth.uid())
    )
  )
);