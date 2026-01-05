
-- Create a function to archive duplicate stories within topics (keeping the oldest)
CREATE OR REPLACE FUNCTION public.archive_title_duplicates()
RETURNS TABLE(archived_count integer, topic_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  rec RECORD;
  total_archived integer := 0;
BEGIN
  -- Find and archive duplicate stories (same title in same topic, keep oldest)
  FOR rec IN 
    SELECT 
      s.id as story_id,
      t.slug as t_slug
    FROM stories s
    JOIN topic_articles ta ON s.topic_article_id = ta.id
    JOIN topics t ON ta.topic_id = t.id
    WHERE s.status = 'published'
    AND s.id NOT IN (
      -- Subquery to find the oldest story for each title+topic combination
      SELECT DISTINCT ON (s2.title, ta2.topic_id) s2.id
      FROM stories s2
      JOIN topic_articles ta2 ON s2.topic_article_id = ta2.id
      WHERE s2.status = 'published'
      ORDER BY s2.title, ta2.topic_id, s2.created_at ASC
    )
    AND EXISTS (
      -- Only archive if there's actually a duplicate
      SELECT 1 FROM stories s3 
      JOIN topic_articles ta3 ON s3.topic_article_id = ta3.id
      WHERE s3.title = s.title 
      AND ta3.topic_id = ta.topic_id 
      AND s3.status = 'published' 
      AND s3.id != s.id
    )
  LOOP
    UPDATE stories SET status = 'archived' WHERE id = rec.story_id;
    total_archived := total_archived + 1;
    topic_slug := rec.t_slug;
    RETURN NEXT;
  END LOOP;
  
  archived_count := total_archived;
END;
$$;
