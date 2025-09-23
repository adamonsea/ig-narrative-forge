-- Fix RLS policies to allow anonymous access to public topics and their related data

-- First, update the topics table RLS policy to allow anonymous read of public topics
DROP POLICY IF EXISTS "All active topics are publicly viewable" ON public.topics;
CREATE POLICY "Public topics viewable by all" ON public.topics
FOR SELECT 
USING (is_active = true AND is_public = true);

-- Allow authenticated users to see all active topics they own or have access to
CREATE POLICY "Users can view topics they have access to" ON public.topics
FOR SELECT 
TO authenticated
USING (
  is_active = true AND (
    created_by = auth.uid() OR 
    has_role(auth.uid(), 'admin'::app_role) OR
    id IN (
      SELECT topic_id FROM topic_memberships 
      WHERE user_id = auth.uid()
    )
  )
);

-- Update stories table to allow public read for published stories of public topics
CREATE POLICY "Public stories of public topics viewable by all" ON public.stories
FOR SELECT 
USING (
  is_published = true AND 
  status IN ('ready', 'published') AND
  article_id IN (
    SELECT a.id FROM articles a 
    JOIN topics t ON t.id = a.topic_id 
    WHERE t.is_public = true AND t.is_active = true
  )
);

-- Update slides table to allow public read for slides of public stories
CREATE POLICY "Public slides viewable by all" ON public.slides
FOR SELECT 
USING (
  story_id IN (
    SELECT s.id FROM stories s
    JOIN articles a ON a.id = s.article_id
    JOIN topics t ON t.id = a.topic_id
    WHERE s.is_published = true 
    AND s.status IN ('ready', 'published')
    AND t.is_public = true 
    AND t.is_active = true
  )
);

-- Drop the existing get_topic_stories function and recreate it with proper anonymous support
DROP FUNCTION IF EXISTS public.get_topic_stories(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_topic_stories(
  p_topic_id uuid,
  p_status text DEFAULT 'published',
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  title text,
  author text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  cover_illustration_url text,
  cover_illustration_prompt text,
  article_id uuid,
  article_title text,
  article_author text,
  article_source_url text,
  article_published_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  topic_is_public boolean;
BEGIN
  -- Check if topic is public and active
  SELECT t.is_public INTO topic_is_public
  FROM topics t 
  WHERE t.id = p_topic_id AND t.is_active = true;
  
  -- If topic not found, return empty
  IF topic_is_public IS NULL THEN
    RETURN;
  END IF;
  
  -- If topic is not public and user is not authenticated, return empty  
  IF NOT topic_is_public AND auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
  -- If topic is private, check user access
  IF NOT topic_is_public AND auth.uid() IS NOT NULL THEN
    -- Check if user has access to this topic
    IF NOT EXISTS (
      SELECT 1 FROM topics t
      WHERE t.id = p_topic_id 
      AND (
        t.created_by = auth.uid() OR
        has_role(auth.uid(), 'admin'::app_role) OR
        EXISTS (
          SELECT 1 FROM topic_memberships tm
          WHERE tm.topic_id = p_topic_id AND tm.user_id = auth.uid()
        )
      )
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- Return stories for the topic
  RETURN QUERY
  SELECT 
    s.id,
    s.title,
    s.author,
    s.created_at,
    s.updated_at,
    s.cover_illustration_url,
    s.cover_illustration_prompt,
    a.id as article_id,
    a.title as article_title,
    a.author as article_author,
    a.source_url as article_source_url,
    a.published_at as article_published_at
  FROM stories s
  JOIN articles a ON a.id = s.article_id
  WHERE a.topic_id = p_topic_id
    AND s.status = p_status
    AND s.is_published = true
  ORDER BY s.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;