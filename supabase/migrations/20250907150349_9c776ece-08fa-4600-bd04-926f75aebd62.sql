-- Fix the incomplete migration: Create active topic-specific sources for Sussex Express
DO $$
DECLARE
    eastbourne_topic_id UUID;
    hastings_topic_id UUID;
    sussex_express_source RECORD;
BEGIN
    -- Get topic IDs
    SELECT id INTO eastbourne_topic_id FROM topics WHERE name = 'Eastbourne' LIMIT 1;
    SELECT id INTO hastings_topic_id FROM topics WHERE name = 'Hastings news' LIMIT 1;
    
    -- Get the original Sussex Express source details (from any deprecated one)
    SELECT DISTINCT canonical_domain, credibility_score, source_type, content_type
    INTO sussex_express_source
    FROM content_sources 
    WHERE canonical_domain = 'sussexexpress.co.uk'
    AND source_name LIKE '%DEPRECATED%'
    LIMIT 1;
    
    -- Create active Sussex Express source for Eastbourne
    INSERT INTO content_sources (
        source_name,
        canonical_domain,
        feed_url,
        topic_id,
        credibility_score,
        source_type,
        content_type,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        'Sussex Express (Eastbourne)',
        'sussexexpress.co.uk',
        'https://www.sussexexpress.co.uk/news/local/eastbourne/rss',
        eastbourne_topic_id,
        COALESCE(sussex_express_source.credibility_score, 75),
        COALESCE(sussex_express_source.source_type, 'regional'),
        COALESCE(sussex_express_source.content_type, 'news'),
        true,
        now(),
        now()
    );
    
    -- Create active Sussex Express source for Hastings
    INSERT INTO content_sources (
        source_name,
        canonical_domain,
        feed_url,
        topic_id,
        credibility_score,
        source_type,
        content_type,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        'Sussex Express (Hastings)',
        'sussexexpress.co.uk',
        'https://www.sussexexpress.co.uk/news/local/hastings/rss',
        hastings_topic_id,
        COALESCE(sussex_express_source.credibility_score, 75),
        COALESCE(sussex_express_source.source_type, 'regional'),
        COALESCE(sussex_express_source.content_type, 'news'),
        true,
        now(),
        now()
    );
    
    RAISE NOTICE 'Created active Sussex Express sources for both Eastbourne and Hastings topics';
    
    -- Log the fix
    INSERT INTO system_logs (level, message, context, function_name)
    VALUES (
        'info',
        'Fixed duplicate sources migration - created active Sussex Express sources',
        jsonb_build_object(
            'eastbourne_topic_id', eastbourne_topic_id,
            'hastings_topic_id', hastings_topic_id,
            'fixed_domain', 'sussexexpress.co.uk'
        ),
        'fix_duplicate_sources_migration'
    );
END $$;