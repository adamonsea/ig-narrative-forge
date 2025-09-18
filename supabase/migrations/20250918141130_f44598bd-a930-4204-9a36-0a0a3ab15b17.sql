-- Phase 3: Restore Published Status to Recent Stories
-- Update stories created in the last few days from 'ready' to 'published'
-- These were incorrectly reset during Phase 1 cleanup

UPDATE stories 
SET 
  status = 'published',
  updated_at = now()
WHERE status = 'ready'
  AND created_at >= '2025-09-10'
  AND (article_id IS NOT NULL OR topic_article_id IS NOT NULL)
  AND title IS NOT NULL;

-- Log the restoration
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Phase 3: Restored published status to recent stories',
  jsonb_build_object(
    'stories_restored', (
      SELECT COUNT(*) 
      FROM stories 
      WHERE status = 'published'
        AND updated_at >= now() - INTERVAL '1 minute'
    ),
    'restoration_date', now()
  ),
  'phase3_story_restoration'
);