-- Phase 2: Clean deprecation - Remove junction table dependencies

-- Step 1: Drop the junction table since we've moved everything back to direct approach
-- Note: This is safe to do after the migration is complete
DROP TABLE IF EXISTS topic_sources CASCADE;

-- Step 2: Log the final cleanup
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Architecture simplification complete - junction table removed',
  jsonb_build_object(
    'junction_table_dropped', true,
    'architecture_fully_simplified', true,
    'all_sources_migrated_to_direct_topic_id', true
  ),
  'architecture_simplification_complete'
);