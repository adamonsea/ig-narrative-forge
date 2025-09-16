-- Fix Sussex Express source to use correct Eastbourne RSS feed
-- Update the existing "Herald EB" source to use the correct RSS feed and associate with Eastbourne
UPDATE content_sources 
SET 
    source_name = 'Sussex Express - Eastbourne',
    feed_url = 'https://www.sussexexpress.co.uk/news/local/eastbourne/rss',
    canonical_domain = 'sussexexpress.co.uk',
    updated_at = now()
WHERE source_name = 'Herald EB' 
   OR (canonical_domain = 'sussexexpress.co.uk' AND feed_url LIKE '%eastbourne%');

-- Ensure the Sussex Express source is linked to the Eastbourne topic
-- First, get the Eastbourne topic ID and Sussex Express source ID
DO $$ 
DECLARE
    eastbourne_topic_id UUID;
    sussex_source_id UUID;
BEGIN
    -- Get Eastbourne topic ID
    SELECT id INTO eastbourne_topic_id 
    FROM topics 
    WHERE LOWER(name) LIKE '%eastbourne%' 
    LIMIT 1;
    
    -- Get Sussex Express source ID
    SELECT id INTO sussex_source_id 
    FROM content_sources 
    WHERE canonical_domain = 'sussexexpress.co.uk' 
       AND feed_url LIKE '%eastbourne%'
    LIMIT 1;
    
    -- Link them if both exist
    IF eastbourne_topic_id IS NOT NULL AND sussex_source_id IS NOT NULL THEN
        INSERT INTO topic_sources (topic_id, source_id, is_active)
        VALUES (eastbourne_topic_id, sussex_source_id, true)
        ON CONFLICT (topic_id, source_id) DO UPDATE SET
            is_active = true,
            updated_at = now();
            
        RAISE NOTICE 'Linked Sussex Express source % to Eastbourne topic %', sussex_source_id, eastbourne_topic_id;
    END IF;
END $$;

-- Deactivate any duplicate or listing-page Sussex Express sources
UPDATE content_sources 
SET is_active = false, updated_at = now()
WHERE canonical_domain = 'sussexexpress.co.uk' 
  AND (
    feed_url LIKE '%your-sussex%' OR
    feed_url LIKE '%east-sussex%' OR
    source_name LIKE '%Herald EB%'
  )
  AND feed_url NOT LIKE '%/rss';

-- Log the changes
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
    'info',
    'Sussex Express source cleanup completed',
    jsonb_build_object(
        'action', 'fix_sussex_express_sources',
        'updated_feed_url', 'https://www.sussexexpress.co.uk/news/local/eastbourne/rss',
        'deactivated_duplicates', true
    ),
    'sussex_express_cleanup'
);