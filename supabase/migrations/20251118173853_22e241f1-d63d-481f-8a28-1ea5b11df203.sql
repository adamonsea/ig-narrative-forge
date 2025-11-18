-- Fix carousel_exports RLS policies to restrict access to story owners only
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Carousel exports viewable by authenticated users" ON carousel_exports;
DROP POLICY IF EXISTS "Carousel exports manageable by authenticated users" ON carousel_exports;

-- Create secure SELECT policy: only see exports from your own topics
CREATE POLICY "Users can view their own story exports" 
ON carousel_exports 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM stories s
    LEFT JOIN articles a ON s.article_id = a.id
    LEFT JOIN topics t1 ON a.topic_id = t1.id
    LEFT JOIN topic_articles ta ON s.topic_article_id = ta.id
    LEFT JOIN topics t2 ON ta.topic_id = t2.id
    WHERE s.id = carousel_exports.story_id
    AND (
      t1.created_by = auth.uid() OR 
      t2.created_by = auth.uid()
    )
  )
);

-- Create secure INSERT policy: only create exports for your own stories
CREATE POLICY "Users can create exports for their own stories" 
ON carousel_exports 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM stories s
    LEFT JOIN articles a ON s.article_id = a.id
    LEFT JOIN topics t1 ON a.topic_id = t1.id
    LEFT JOIN topic_articles ta ON s.topic_article_id = ta.id
    LEFT JOIN topics t2 ON ta.topic_id = t2.id
    WHERE s.id = carousel_exports.story_id
    AND (
      t1.created_by = auth.uid() OR 
      t2.created_by = auth.uid()
    )
  )
);

-- Create secure UPDATE policy: only update exports for your own stories
CREATE POLICY "Users can update their own story exports" 
ON carousel_exports 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM stories s
    LEFT JOIN articles a ON s.article_id = a.id
    LEFT JOIN topics t1 ON a.topic_id = t1.id
    LEFT JOIN topic_articles ta ON s.topic_article_id = ta.id
    LEFT JOIN topics t2 ON ta.topic_id = t2.id
    WHERE s.id = carousel_exports.story_id
    AND (
      t1.created_by = auth.uid() OR 
      t2.created_by = auth.uid()
    )
  )
);

-- Create secure DELETE policy: only delete exports for your own stories
CREATE POLICY "Users can delete their own story exports" 
ON carousel_exports 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM stories s
    LEFT JOIN articles a ON s.article_id = a.id
    LEFT JOIN topics t1 ON a.topic_id = t1.id
    LEFT JOIN topic_articles ta ON s.topic_article_id = ta.id
    LEFT JOIN topics t2 ON ta.topic_id = t2.id
    WHERE s.id = carousel_exports.story_id
    AND (
      t1.created_by = auth.uid() OR 
      t2.created_by = auth.uid()
    )
  )
);

-- Service role maintains full access
CREATE POLICY "Service role has full access to carousel exports" 
ON carousel_exports 
FOR ALL 
USING (auth.role() = 'service_role');

COMMENT ON TABLE carousel_exports IS 'Story carousel exports - RLS enforces topic ownership via story->article/topic_article->topic chain';