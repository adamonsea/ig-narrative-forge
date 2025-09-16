-- Migration to ensure all content sources use the multi-tenant topic_sources junction table
-- This will move any sources still using the old topic_id approach to the new system

-- First, insert any sources that have topic_id but aren't in topic_sources
INSERT INTO topic_sources (topic_id, source_id, is_active, created_at, updated_at)
SELECT 
  cs.topic_id,
  cs.id,
  cs.is_active,
  now(),
  now()
FROM content_sources cs
WHERE cs.topic_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM topic_sources ts 
  WHERE ts.source_id = cs.id AND ts.topic_id = cs.topic_id
)
ON CONFLICT DO NOTHING;

-- Update the content_sources table to remove topic_id (if not already done)
-- This ensures sources are only linked via the junction table
UPDATE content_sources 
SET topic_id = NULL 
WHERE topic_id IS NOT NULL;

-- Log the migration
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Migrated content sources to use multi-tenant junction table only',
  jsonb_build_object(
    'migration_date', now(),
    'sources_migrated', (
      SELECT COUNT(*) FROM topic_sources
    )
  ),
  'source_multitenant_migration'
);