-- Phase 4: Complete Story Status Restoration
-- Restore ALL legitimate 'ready' stories back to 'published' status
-- These were incorrectly reset during Phase 1 and should be visible again

UPDATE stories 
SET 
  status = 'published',
  updated_at = now()
WHERE status = 'ready'
  AND (article_id IS NOT NULL OR topic_article_id IS NOT NULL)
  AND title IS NOT NULL
  AND id IN (
    SELECT s.id 
    FROM stories s
    LEFT JOIN slides sl ON sl.story_id = s.id
    WHERE s.status = 'ready'
      AND (s.article_id IS NOT NULL OR s.topic_article_id IS NOT NULL)
      AND s.title IS NOT NULL
      AND sl.id IS NOT NULL  -- Only restore stories that have slides (real content)
    GROUP BY s.id
    HAVING COUNT(sl.id) > 0
  );

-- Log the complete restoration
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Phase 4: Complete story status restoration executed',
  jsonb_build_object(
    'total_stories_restored', (
      SELECT COUNT(*) 
      FROM stories 
      WHERE status = 'published'
        AND updated_at >= now() - INTERVAL '1 minute'
    ),
    'restoration_scope', 'all_legitimate_ready_stories',
    'restoration_date', now()
  ),
  'phase4_complete_restoration'
);