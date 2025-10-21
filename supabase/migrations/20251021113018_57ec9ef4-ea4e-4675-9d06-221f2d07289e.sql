-- Clean up Josh Babarinde parliamentary votes from Hastings topic
-- Josh Babarinde is the Eastbourne MP, not Hastings MP

-- Step 1: Delete parliamentary mentions for Josh Babarinde in Hastings topic
DELETE FROM parliamentary_mentions
WHERE topic_id = 'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa'
  AND mp_name = 'Josh Babarinde';

-- Step 2: Delete stories that are parliamentary and linked to Josh Babarinde votes
-- (These will cascade delete slides automatically)
DELETE FROM stories
WHERE is_parliamentary = true
  AND id IN (
    SELECT story_id 
    FROM parliamentary_mentions 
    WHERE topic_id = 'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa'
      AND mp_name = 'Josh Babarinde'
  );

-- Step 3: Clean up any orphaned topic_articles that were created for these parliamentary stories
DELETE FROM topic_articles
WHERE topic_id = 'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa'
  AND NOT EXISTS (
    SELECT 1 FROM stories 
    WHERE stories.topic_article_id = topic_articles.id
  )
  AND EXISTS (
    SELECT 1 FROM shared_article_content sac
    WHERE sac.id = topic_articles.shared_content_id
      AND sac.title LIKE '%Josh Babarinde%'
  );