-- Direct cleanup bypass via SQL
-- Step 1: Delete all slides for parliamentary stories in this topic
DELETE FROM slides
WHERE story_id IN (
  SELECT s.id 
  FROM stories s
  JOIN parliamentary_mentions pm ON pm.story_id = s.id
  WHERE pm.topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
);

-- Step 2: Delete stories
DELETE FROM stories
WHERE id IN (
  SELECT s.id 
  FROM stories s
  JOIN parliamentary_mentions pm ON pm.story_id = s.id
  WHERE pm.topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
);

-- Step 3: Reset story_id in parliamentary_mentions
UPDATE parliamentary_mentions
SET story_id = NULL
WHERE topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';

-- Step 4: Delete content_generation_queue items
DELETE FROM content_generation_queue
WHERE topic_article_id IN (
  SELECT ta.id 
  FROM topic_articles ta 
  WHERE ta.topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
    AND ta.shared_content_id IN (
      SELECT id FROM shared_article_content 
      WHERE url ILIKE '%commonsvotes%' OR url ILIKE '%parliament%'
    )
);

-- Step 5: Delete orphaned topic_articles
DELETE FROM topic_articles
WHERE topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
  AND NOT EXISTS (SELECT 1 FROM stories s WHERE s.topic_article_id = topic_articles.id)
  AND shared_content_id IN (
    SELECT id FROM shared_article_content 
    WHERE url ILIKE '%commonsvotes%' OR url ILIKE '%parliament%'
  );

-- Step 6: Delete orphaned shared_article_content
DELETE FROM shared_article_content
WHERE (url ILIKE '%commonsvotes%' OR url ILIKE '%parliament%')
  AND NOT EXISTS (SELECT 1 FROM topic_articles ta WHERE ta.shared_content_id = shared_article_content.id)
  AND NOT EXISTS (SELECT 1 FROM stories s WHERE s.shared_content_id = shared_article_content.id);