-- Phase 5: Clean up minor vote stories
-- Step 1: Null out story_id on minor vote mentions
UPDATE public.parliamentary_mentions
SET story_id = NULL
WHERE story_id IN (
  SELECT DISTINCT s.id
  FROM stories s
  JOIN parliamentary_mentions pm ON pm.story_id = s.id
  WHERE s.is_parliamentary = true
  AND pm.is_major_vote = false
);

-- Step 2: Delete orphaned minor vote stories (stories with no slides referencing them)
-- Using cascade approach: delete slides first, then related records, then stories
DELETE FROM public.slides
WHERE story_id IN (
  SELECT s.id FROM stories s
  WHERE s.is_parliamentary = true
  AND NOT EXISTS (
    SELECT 1 FROM parliamentary_mentions pm 
    WHERE pm.story_id = s.id
  )
);

DELETE FROM public.posts
WHERE story_id IN (
  SELECT s.id FROM stories s
  WHERE s.is_parliamentary = true
  AND NOT EXISTS (
    SELECT 1 FROM parliamentary_mentions pm 
    WHERE pm.story_id = s.id
  )
);

DELETE FROM public.stories
WHERE is_parliamentary = true
AND NOT EXISTS (
  SELECT 1 FROM parliamentary_mentions pm 
  WHERE pm.story_id = stories.id
);