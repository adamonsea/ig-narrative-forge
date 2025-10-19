-- Clean up hybrid stories by nullifying article_id where topic_article_id exists
-- This fixes the duplicate rows bug in get_topic_stories_with_keywords

UPDATE stories 
SET article_id = NULL 
WHERE article_id IS NOT NULL 
  AND topic_article_id IS NOT NULL;

-- Log the cleanup for audit purposes
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Cleaned up hybrid stories - nullified article_id where topic_article_id exists',
  jsonb_build_object(
    'stories_affected', (SELECT COUNT(*) FROM stories WHERE article_id IS NULL AND topic_article_id IS NOT NULL),
    'migration_date', now()
  ),
  'hybrid_story_cleanup_migration'
);