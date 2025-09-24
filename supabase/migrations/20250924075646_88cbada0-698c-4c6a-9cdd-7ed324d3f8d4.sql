-- Phase 2: Fix slides table access and create public feed function (corrected)
-- Ensure slides from public stories are accessible

-- Add public slides access policy (drop first if exists)
DROP POLICY IF EXISTS "Slides from public stories are viewable" ON public.slides;

CREATE POLICY "Slides from public stories are viewable"
ON public.slides 
FOR SELECT 
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = slides.story_id 
    AND s.is_published = true
    AND (
      -- Legacy articles
      EXISTS (
        SELECT 1 FROM articles a 
        JOIN topics t ON t.id = a.topic_id 
        WHERE a.id = s.article_id 
        AND t.is_public = true 
        AND t.is_active = true
      )
      OR
      -- Multi-tenant articles  
      EXISTS (
        SELECT 1 FROM topic_articles ta
        JOIN topics t ON t.id = ta.topic_id
        WHERE ta.id = s.topic_article_id 
        AND t.is_public = true 
        AND t.is_active = true
      )
    )
  )
);