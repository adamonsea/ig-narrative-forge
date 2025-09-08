-- Phase 1: Clean up existing duplicates first

-- Step 1: Remove duplicate sources (keep the first one, remove others)
WITH ranked_sources AS (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY feed_url, topic_id ORDER BY created_at ASC) as rn
  FROM content_sources 
  WHERE topic_id IS NOT NULL
)
DELETE FROM content_sources 
WHERE id IN (
  SELECT id FROM ranked_sources WHERE rn > 1
);

-- Step 2: Now migrate junction table sources that don't have duplicates
UPDATE content_sources 
SET topic_id = ts.topic_id,
    updated_at = now()
FROM topic_sources ts 
WHERE content_sources.id = ts.source_id 
  AND ts.is_active = true 
  AND content_sources.topic_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_sources cs2 
    WHERE cs2.feed_url = content_sources.feed_url 
      AND cs2.topic_id = ts.topic_id
  );

-- Step 3: Log cleanup results
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Cleaned up duplicate sources before migration',
  jsonb_build_object(
    'duplicates_removed', true,
    'junction_migration_attempted', true
  ),
  'duplicate_cleanup_migration'
);