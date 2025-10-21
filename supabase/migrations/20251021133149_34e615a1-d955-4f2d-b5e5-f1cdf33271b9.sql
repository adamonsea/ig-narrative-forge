-- Fix all three parliamentary automation bugs
-- 1. Clean up Josh Babarinde stories from Hastings
-- 2. Backfill processing_status for parliamentary topic_articles
-- 3. Standardize status for parliamentary stories

-- PHASE 1: Delete Josh Babarinde stories from Hastings topic using cascade
DO $$
DECLARE
  story_record RECORD;
  deleted_count INTEGER := 0;
BEGIN
  -- Find all stories with Josh Babarinde in title that have parliamentary mentions for Hastings
  FOR story_record IN 
    SELECT DISTINCT s.id, s.title
    FROM stories s
    WHERE s.title LIKE '%Josh Babarinde%'
      AND s.is_parliamentary = true
      AND EXISTS (
        SELECT 1 FROM parliamentary_mentions pm 
        WHERE pm.story_id = s.id 
        AND pm.topic_id = 'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa'
      )
  LOOP
    RAISE NOTICE 'Deleting Josh Babarinde story: % - %', story_record.id, story_record.title;
    
    -- Use the cascade delete function
    PERFORM delete_story_cascade(story_record.id);
    deleted_count := deleted_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Phase 1 complete: Deleted % Josh Babarinde stories from Hastings', deleted_count;
END $$;

-- PHASE 2: Backfill processing_status for parliamentary topic_articles
-- (Already correct in code, but backfill existing records)
UPDATE topic_articles ta
SET processing_status = 'processed'
FROM stories s
WHERE s.topic_article_id = ta.id
  AND s.is_parliamentary = true
  AND ta.processing_status = 'new';

-- PHASE 3: Standardize status for parliamentary stories
-- Change all parliamentary stories from 'ready' to 'published'
UPDATE stories
SET status = 'published'
WHERE is_parliamentary = true
  AND is_published = true
  AND status = 'ready';

-- Log the migration
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Fixed parliamentary automation bugs',
  jsonb_build_object(
    'phase_1', 'Deleted Josh Babarinde stories from Hastings',
    'phase_2', 'Backfilled processing_status for parliamentary topic_articles',
    'phase_3', 'Standardized status for parliamentary stories to published',
    'affected_topics', jsonb_build_array('c31d9371-24f4-4f26-9bd7-816f5ffdfbaa')
  ),
  'fix_parliamentary_bugs'
);