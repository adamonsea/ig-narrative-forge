-- Fix the Panto Star story's article published_at to its original creation date
UPDATE shared_article_content 
SET published_at = '2025-12-03T08:26:54+00'
WHERE id = (
  SELECT ta.shared_content_id 
  FROM stories s
  JOIN topic_articles ta ON s.topic_article_id = ta.id
  WHERE s.id = 'a05656a8-b093-4a24-9638-639e9cbfa137'
);