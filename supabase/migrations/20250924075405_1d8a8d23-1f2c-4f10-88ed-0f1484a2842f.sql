-- Phase 1 continued: Simplify Stories Table RLS policies
-- Remove conflicting policies and create clear, simple ones for public access

-- Remove all existing conflicting stories policies for public access
DROP POLICY IF EXISTS "All published stories are publicly viewable" ON public.stories;
DROP POLICY IF EXISTS "Public read: public stories" ON public.stories;  
DROP POLICY IF EXISTS "Public read: published stories" ON public.stories;
DROP POLICY IF EXISTS "Public stories of public topics viewable by all" ON public.stories;
DROP POLICY IF EXISTS "Stories from public topics are publicly viewable" ON public.stories;

-- Create single, clear policy for public story access
CREATE POLICY "Published stories from public topics are publicly viewable"
ON public.stories 
FOR SELECT 
TO anon, authenticated
USING (
  is_published = true 
  AND (
    -- Legacy articles with direct topic connection
    EXISTS (
      SELECT 1 FROM articles a 
      JOIN topics t ON t.id = a.topic_id 
      WHERE a.id = stories.article_id 
      AND t.is_public = true 
      AND t.is_active = true
    )
    OR
    -- Multi-tenant articles through topic_articles
    EXISTS (
      SELECT 1 FROM topic_articles ta
      JOIN topics t ON t.id = ta.topic_id
      WHERE ta.id = stories.topic_article_id 
      AND t.is_public = true 
      AND t.is_active = true
    )
  )
);