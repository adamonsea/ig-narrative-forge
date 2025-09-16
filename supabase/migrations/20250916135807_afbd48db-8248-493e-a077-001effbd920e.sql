-- Simple cleanup: Remove the inactive Sussex Express source entries
DO $$
DECLARE
    eastbourne_topic_id UUID;
    inactive_topic_source_id UUID;
    old_source_id UUID;
BEGIN
    -- Get Eastbourne topic ID
    SELECT id INTO eastbourne_topic_id FROM topics WHERE name = 'Eastbourne';
    
    IF eastbourne_topic_id IS NOT NULL THEN
        -- Find the inactive topic_source entry
        SELECT ts.id, ts.source_id INTO inactive_topic_source_id, old_source_id
        FROM topic_sources ts 
        JOIN content_sources cs ON ts.source_id = cs.id
        WHERE ts.topic_id = eastbourne_topic_id 
          AND cs.source_name = 'Sussex Express - Eastbourne'
          AND ts.is_active = false
        LIMIT 1;
        
        IF inactive_topic_source_id IS NOT NULL THEN
            -- Remove the inactive topic_source link
            DELETE FROM topic_sources WHERE id = inactive_topic_source_id;
            
            -- Remove the old content_source if it's not used elsewhere
            DELETE FROM content_sources 
            WHERE id = old_source_id 
              AND NOT EXISTS (
                SELECT 1 FROM topic_sources WHERE source_id = old_source_id
              );
            
            -- Log the cleanup
            INSERT INTO system_logs (level, message, context, function_name)
            VALUES (
                'info',
                'Removed inactive Sussex Express source',
                jsonb_build_object(
                    'removed_topic_source_id', inactive_topic_source_id,
                    'removed_source_id', old_source_id,
                    'topic_id', eastbourne_topic_id
                ),
                'cleanup_inactive_sussex_express'
            );
        END IF;
    END IF;
END $$;