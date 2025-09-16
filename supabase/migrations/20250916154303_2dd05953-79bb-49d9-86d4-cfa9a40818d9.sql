-- Create a function to clean up orphaned legacy sources (not linked to any topics)
CREATE OR REPLACE FUNCTION cleanup_orphaned_legacy_sources()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  orphaned_count INTEGER := 0;
  cleanup_result jsonb;
BEGIN
  -- Delete sources that are not linked to any topics via topic_sources
  -- This preserves all sources that are actively being used in the multi-tenant system
  WITH deleted_sources AS (
    DELETE FROM content_sources cs
    WHERE NOT EXISTS (
      SELECT 1 FROM topic_sources ts 
      WHERE ts.source_id = cs.id
    )
    AND cs.id NOT IN (
      -- Preserve any sources that might be directly referenced in topics (legacy)
      SELECT DISTINCT source_id 
      FROM articles 
      WHERE source_id IS NOT NULL
      UNION
      SELECT DISTINCT source_id 
      FROM topic_articles 
      WHERE source_id IS NOT NULL
    )
    RETURNING id
  )
  SELECT count(*) INTO orphaned_count FROM deleted_sources;
  
  -- Log the cleanup
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Cleaned up orphaned legacy sources',
    jsonb_build_object(
      'orphaned_sources_removed', orphaned_count,
      'cleanup_type', 'legacy_migration'
    ),
    'cleanup_orphaned_legacy_sources'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'orphaned_sources_removed', orphaned_count,
    'message', format('Successfully removed %s orphaned sources', orphaned_count)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'message', 'Failed to cleanup orphaned sources'
    );
END;
$$;