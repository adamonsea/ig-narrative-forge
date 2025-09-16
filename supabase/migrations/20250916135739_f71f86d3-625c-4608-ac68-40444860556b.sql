-- Clean up duplicate Sussex Express sources for Eastbourne topic
-- Keep only the most recent Sussex Express - Eastbourne source

-- First, get the Eastbourne topic ID
DO $$
DECLARE
    eastbourne_topic_id UUID;
    keep_source_id UUID;
    duplicate_source_id UUID;
BEGIN
    -- Get Eastbourne topic ID
    SELECT id INTO eastbourne_topic_id FROM topics WHERE name = 'Eastbourne';
    
    IF eastbourne_topic_id IS NOT NULL THEN
        -- Get the most recent Sussex Express - Eastbourne source
        SELECT id INTO keep_source_id 
        FROM content_sources 
        WHERE source_name = 'Sussex Express - Eastbourne'
        ORDER BY created_at DESC 
        LIMIT 1;
        
        -- Get the older duplicate
        SELECT id INTO duplicate_source_id 
        FROM content_sources 
        WHERE source_name = 'Sussex Express - Eastbourne' 
          AND id != keep_source_id
        LIMIT 1;
        
        IF duplicate_source_id IS NOT NULL THEN
            -- Update topic_sources to use the newer source
            UPDATE topic_sources 
            SET source_id = keep_source_id 
            WHERE topic_id = eastbourne_topic_id 
              AND source_id = duplicate_source_id;
            
            -- Delete the duplicate source
            DELETE FROM content_sources WHERE id = duplicate_source_id;
            
            -- Log the cleanup
            INSERT INTO system_logs (level, message, context, function_name)
            VALUES (
                'info',
                'Cleaned up duplicate Sussex Express source',
                jsonb_build_object(
                    'kept_source_id', keep_source_id,
                    'removed_source_id', duplicate_source_id,
                    'topic_id', eastbourne_topic_id
                ),
                'cleanup_duplicate_sussex_express'
            );
        END IF;
        
        -- Ensure the kept source has the correct RSS URL
        UPDATE content_sources 
        SET feed_url = 'https://www.sussexexpress.co.uk/news/local/eastbourne/rss'
        WHERE id = keep_source_id;
    END IF;
END $$;