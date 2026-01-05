
-- One-time cleanup: Unpublish duplicate stories (same title in same topic, keep oldest)
WITH duplicates_to_unpublish AS (
  SELECT s.id as story_id
  FROM stories s
  JOIN topic_articles ta ON s.topic_article_id = ta.id
  WHERE s.status = 'published'
  AND s.id NOT IN (
    -- Keep the oldest story for each title+topic combination
    SELECT DISTINCT ON (s2.title, ta2.topic_id) s2.id
    FROM stories s2
    JOIN topic_articles ta2 ON s2.topic_article_id = ta2.id
    WHERE s2.status = 'published'
    ORDER BY s2.title, ta2.topic_id, s2.created_at ASC
  )
  AND EXISTS (
    -- Only unpublish if there's actually a duplicate
    SELECT 1 FROM stories s3 
    JOIN topic_articles ta3 ON s3.topic_article_id = ta3.id
    WHERE s3.title = s.title 
    AND ta3.topic_id = ta.topic_id 
    AND s3.status = 'published' 
    AND s3.id != s.id
  )
)
UPDATE stories 
SET is_published = false, status = 'draft', updated_at = NOW()
WHERE id IN (SELECT story_id FROM duplicates_to_unpublish);
