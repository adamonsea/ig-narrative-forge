-- Phase 1: Architecture Simplification - Move back to direct topic_id approach

-- Step 1: Migrate all junction table sources back to direct topic_id relationships
UPDATE content_sources 
SET topic_id = ts.topic_id,
    updated_at = now()
FROM topic_sources ts 
WHERE content_sources.id = ts.source_id 
  AND ts.is_active = true 
  AND content_sources.topic_id IS NULL;

-- Step 2: Remove unique constraint on feed_url to allow same source across different topics  
ALTER TABLE content_sources DROP CONSTRAINT IF EXISTS content_sources_feed_url_key;

-- Step 3: Create a unique constraint that allows same URL for different topics
DROP INDEX IF EXISTS idx_content_sources_feed_url_topic;
CREATE UNIQUE INDEX idx_content_sources_feed_url_topic 
ON content_sources (feed_url, COALESCE(topic_id::text, ''));

-- Step 4: Update any functions that still reference junction table
DROP FUNCTION IF EXISTS get_topic_sources(uuid);
DROP FUNCTION IF EXISTS add_source_to_topic(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS remove_source_from_topic(uuid, uuid);
DROP FUNCTION IF EXISTS get_source_topics(uuid);
DROP FUNCTION IF EXISTS populate_topic_sources_from_existing();

-- Step 5: Log the migration for debugging
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Architecture simplified - moved back to direct topic_id approach',
  jsonb_build_object(
    'migration_completed', true,
    'junction_table_deprecated', true,
    'direct_topic_id_restored', true
  ),
  'architecture_simplification_migration'
);