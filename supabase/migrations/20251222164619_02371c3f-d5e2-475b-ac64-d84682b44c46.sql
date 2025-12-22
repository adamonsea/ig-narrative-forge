-- Drop existing policies that need updating
DROP POLICY IF EXISTS "Stories manageable by owners only" ON public.stories;
DROP POLICY IF EXISTS "Story creators and admins can manage stories" ON public.stories;

-- Recreate policies with topic_article_id support for multi-tenant stories
CREATE POLICY "Stories manageable by owners only" ON public.stories
FOR ALL
USING (
  (auth.role() = 'service_role'::text) OR
  (auth.uid() IS NOT NULL AND (
    -- Legacy: via article's topic owner
    (article_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM articles a
      JOIN topics t ON t.id = a.topic_id
      WHERE a.id = stories.article_id AND t.created_by = auth.uid()
    )) OR
    -- Multi-tenant: via topic_article's topic owner
    (topic_article_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM topic_articles ta
      JOIN topics t ON t.id = ta.topic_id
      WHERE ta.id = stories.topic_article_id AND t.created_by = auth.uid()
    )) OR
    -- Admin override
    has_role(auth.uid(), 'admin'::app_role)
  ))
)
WITH CHECK (
  (auth.role() = 'service_role'::text) OR
  (auth.uid() IS NOT NULL AND (
    -- Legacy: via article's topic owner
    (article_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM articles a
      JOIN topics t ON t.id = a.topic_id
      WHERE a.id = stories.article_id AND t.created_by = auth.uid()
    )) OR
    -- Multi-tenant: via topic_article's topic owner
    (topic_article_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM topic_articles ta
      JOIN topics t ON t.id = ta.topic_id
      WHERE ta.id = stories.topic_article_id AND t.created_by = auth.uid()
    )) OR
    -- Admin override
    has_role(auth.uid(), 'admin'::app_role)
  ))
);

CREATE POLICY "Story creators and admins can manage stories" ON public.stories
FOR ALL
USING (
  (auth.role() = 'service_role'::text) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  -- Legacy: via article's topic owner
  (article_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM articles a
    JOIN topics t ON t.id = a.topic_id
    WHERE a.id = stories.article_id AND t.created_by = auth.uid()
  )) OR
  -- Multi-tenant: via topic_article's topic owner
  (topic_article_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM topic_articles ta
    JOIN topics t ON t.id = ta.topic_id
    WHERE ta.id = stories.topic_article_id AND t.created_by = auth.uid()
  ))
)
WITH CHECK (
  (auth.role() = 'service_role'::text) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  -- Legacy: via article's topic owner
  (article_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM articles a
    JOIN topics t ON t.id = a.topic_id
    WHERE a.id = stories.article_id AND t.created_by = auth.uid()
  )) OR
  -- Multi-tenant: via topic_article's topic owner
  (topic_article_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM topic_articles ta
    JOIN topics t ON t.id = ta.topic_id
    WHERE ta.id = stories.topic_article_id AND t.created_by = auth.uid()
  ))
);