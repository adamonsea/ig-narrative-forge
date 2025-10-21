
-- Delete misplaced Josh Babarinde stories created for Hastings today
-- These should have been created for Eastbourne
-- Must delete in correct order: slides -> stories -> topic_articles

-- Store the IDs we need to work with
CREATE TEMP TABLE IF NOT EXISTS temp_misplaced_story_ids AS
SELECT 
  s.id as story_id,
  s.topic_article_id,
  ta.topic_id
FROM stories s
JOIN topic_articles ta ON ta.id = s.topic_article_id
WHERE s.is_parliamentary = true
  AND s.created_at::date = CURRENT_DATE
  AND ta.topic_id = 'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa' -- Hastings
  AND s.title ILIKE '%Josh Babarinde%';

-- Step 1: Unlink parliamentary mentions
UPDATE parliamentary_mentions pm
SET story_id = NULL
WHERE story_id IN (SELECT story_id FROM temp_misplaced_story_ids);

-- Step 2: Delete slides
DELETE FROM slides
WHERE story_id IN (SELECT story_id FROM temp_misplaced_story_ids);

-- Step 3: Delete stories
DELETE FROM stories
WHERE id IN (SELECT story_id FROM temp_misplaced_story_ids);

-- Step 4: Delete the misplaced topic_articles
DELETE FROM topic_articles
WHERE id IN (SELECT topic_article_id FROM temp_misplaced_story_ids);

-- Cleanup
DROP TABLE IF EXISTS temp_misplaced_story_ids;
