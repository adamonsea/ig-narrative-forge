-- Duplicate shared sources approach: Create topic-specific sources for shared domains

-- First, let's see what we're working with
DO $$
DECLARE
    shared_source RECORD;
    target_topic RECORD;
    new_source_id UUID;
BEGIN
    -- Find sources that appear in multiple topics (shared domains)
    FOR shared_source IN 
        SELECT DISTINCT canonical_domain, feed_url, source_name, credibility_score, source_type, content_type
        FROM content_sources 
        WHERE canonical_domain IN (
            SELECT canonical_domain 
            FROM content_sources 
            WHERE topic_id IS NOT NULL 
            GROUP BY canonical_domain 
            HAVING COUNT(DISTINCT topic_id) > 1
        )
        AND topic_id IS NOT NULL
    LOOP
        -- For each shared domain, create separate sources for each topic
        FOR target_topic IN 
            SELECT DISTINCT t.id as topic_id, t.name as topic_name
            FROM topics t
            JOIN content_sources cs ON cs.topic_id = t.id
            WHERE cs.canonical_domain = shared_source.canonical_domain
        LOOP
            -- Check if we already have a dedicated source for this topic+domain combo
            IF NOT EXISTS (
                SELECT 1 FROM content_sources 
                WHERE topic_id = target_topic.topic_id 
                AND canonical_domain = shared_source.canonical_domain
                AND source_name LIKE '%' || target_topic.topic_name || '%'
            ) THEN
                -- Create topic-specific source
                INSERT INTO content_sources (
                    source_name,
                    canonical_domain,
                    feed_url,
                    topic_id,
                    credibility_score,
                    source_type,
                    content_type,
                    is_active,
                    region,
                    created_at,
                    updated_at
                ) VALUES (
                    shared_source.source_name || ' (' || target_topic.topic_name || ')',
                    shared_source.canonical_domain,
                    shared_source.feed_url,
                    target_topic.topic_id,
                    shared_source.credibility_score,
                    shared_source.source_type,
                    shared_source.content_type,
                    true,
                    NULL, -- Will be set based on topic if needed
                    now(),
                    now()
                ) RETURNING id INTO new_source_id;
                
                RAISE NOTICE 'Created topic-specific source: % for topic: % (ID: %)', 
                    shared_source.source_name || ' (' || target_topic.topic_name || ')', 
                    target_topic.topic_name,
                    new_source_id;
            END IF;
        END LOOP;
    END LOOP;
    
    -- Now deactivate the original shared sources (don't delete to preserve history)
    UPDATE content_sources 
    SET is_active = false,
        updated_at = now(),
        source_name = source_name || ' (DEPRECATED - replaced by topic-specific sources)'
    WHERE canonical_domain IN (
        SELECT canonical_domain 
        FROM content_sources 
        WHERE topic_id IS NOT NULL 
        GROUP BY canonical_domain 
        HAVING COUNT(DISTINCT topic_id) > 1
    )
    AND topic_id IS NOT NULL
    AND is_active = true
    AND source_name NOT LIKE '%(DEPRECATED%';
    
    -- Log the migration
    INSERT INTO system_logs (level, message, context, function_name)
    VALUES (
        'info',
        'Completed duplicate sources migration - converted shared sources to topic-specific sources',
        jsonb_build_object(
            'migration_type', 'duplicate_sources',
            'timestamp', now()
        ),
        'duplicate_sources_migration'
    );
END $$;