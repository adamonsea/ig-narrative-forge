-- Phase 1: Clean duplicate handling migration

-- Step 1: First, let's see what duplicates we have by finding sources without topic_id that need migration
-- and handle duplicates by keeping the first one and removing others

-- Create a temporary function to handle duplicate migration
CREATE OR REPLACE FUNCTION migrate_junction_to_direct() RETURNS void AS $$
DECLARE
  junction_record RECORD;
  duplicate_check INTEGER;
BEGIN
  -- Loop through all active junction table entries
  FOR junction_record IN 
    SELECT DISTINCT ts.topic_id, ts.source_id, cs.feed_url, cs.source_name
    FROM topic_sources ts 
    JOIN content_sources cs ON cs.id = ts.source_id
    WHERE ts.is_active = true 
      AND cs.topic_id IS NULL
  LOOP
    -- Check if this combination already exists
    SELECT COUNT(*) INTO duplicate_check
    FROM content_sources 
    WHERE feed_url = junction_record.feed_url 
      AND topic_id = junction_record.topic_id;
    
    -- If no duplicate exists, update the source
    IF duplicate_check = 0 THEN
      UPDATE content_sources 
      SET topic_id = junction_record.topic_id,
          updated_at = now()
      WHERE id = junction_record.source_id;
    ELSE
      -- Log that we skipped a duplicate
      INSERT INTO system_logs (level, message, context, function_name)
      VALUES (
        'info',
        'Skipped duplicate source during migration',
        jsonb_build_object(
          'source_id', junction_record.source_id,
          'topic_id', junction_record.topic_id,
          'feed_url', junction_record.feed_url
        ),
        'migrate_junction_to_direct'
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the migration
SELECT migrate_junction_to_direct();

-- Drop the temporary function
DROP FUNCTION migrate_junction_to_direct();

-- Step 2: Remove the old unique constraint if it exists
ALTER TABLE content_sources DROP CONSTRAINT IF EXISTS content_sources_feed_url_key;

-- Step 3: Allow duplicate URLs across different topics by creating a partial unique index
-- This allows same URL for different topics but prevents true duplicates within same topic
DROP INDEX IF EXISTS idx_content_sources_unique_topic_url;
CREATE UNIQUE INDEX idx_content_sources_unique_topic_url 
ON content_sources (feed_url, topic_id) 
WHERE topic_id IS NOT NULL;

-- Step 4: Log completion
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Junction table migration completed with duplicate handling',
  jsonb_build_object(
    'migration_completed', true,
    'duplicates_handled', true,
    'direct_topic_id_approach_restored', true
  ),
  'junction_to_direct_migration'
);