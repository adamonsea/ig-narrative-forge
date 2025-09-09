-- Add archive functionality to topics
ALTER TABLE topics ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS archived_by UUID DEFAULT NULL;

-- Update the bulk cleanup function to only target current user's topics
CREATE OR REPLACE FUNCTION public.bulk_cleanup_user_topics(p_user_id uuid, p_action text DEFAULT 'archive')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  topic_record RECORD;
  results jsonb[] := '{}';
  total_processed INTEGER := 0;
BEGIN
  -- Only target the user's own topics (excluding the working ones)
  FOR topic_record IN 
    SELECT id, name, topic_type, region
    FROM topics 
    WHERE created_by = p_user_id
      AND id NOT IN (
        -- Preserve Eastbourne and AI for Agency
        'd224e606-1a4c-4713-8135-1d30e2d6d0c6', 
        'e9064e24-9a87-4de8-8dca-8091ce26fb8a'
      )
  LOOP
    IF p_action = 'archive' THEN
      -- Archive the topic
      UPDATE topics 
      SET is_archived = true, 
          archived_at = now(), 
          archived_by = p_user_id
      WHERE id = topic_record.id;
      
      results := results || jsonb_build_object(
        'topic_id', topic_record.id,
        'topic_name', topic_record.name,
        'action', 'archived',
        'success', true
      );
    ELSIF p_action = 'delete' THEN
      -- Use existing cascade delete function
      DECLARE
        delete_result jsonb;
      BEGIN
        SELECT delete_topic_cascade(topic_record.id) INTO delete_result;
        results := results || delete_result;
      END;
    END IF;
    
    total_processed := total_processed + 1;
  END LOOP;
  
  -- Log the operation
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Bulk user topic operation completed',
    jsonb_build_object(
      'user_id', p_user_id,
      'action', p_action,
      'topics_processed', total_processed
    ),
    'bulk_cleanup_user_topics'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'topics_processed', total_processed,
    'results', results
  );
END;
$function$