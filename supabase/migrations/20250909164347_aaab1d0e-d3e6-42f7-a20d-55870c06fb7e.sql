-- Fix Argus source linkages for Eastbourne topic
-- Activate the working RSS source (28 articles) for Eastbourne
UPDATE topic_sources 
SET is_active = true, updated_at = now()
WHERE topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'::uuid 
AND source_id = '10c6ff62-c84a-4ad1-b3d0-4b911ce86474'::uuid;

-- Add the working RSS source if it doesn't exist in topic_sources
INSERT INTO topic_sources (topic_id, source_id, is_active, source_config)
VALUES (
    'd224e606-1a4c-4713-8135-1d30e2d6d0c6'::uuid,  -- Eastbourne topic ID
    '10c6ff62-c84a-4ad1-b3d0-4b911ce86474'::uuid,  -- Working Argus RSS source (28 articles)
    true,
    '{"reactivated_working_source": true, "migration_date": "2025-01-09"}'::jsonb
)
ON CONFLICT (topic_id, source_id) 
DO UPDATE SET 
    is_active = true,
    source_config = topic_sources.source_config || '{"reactivated_working_source": true}'::jsonb,
    updated_at = now();

-- Update scraping method for the failed sources to use RSS (proper method)
UPDATE content_sources 
SET scraping_method = 'rss',
    updated_at = now()
WHERE id IN (
    '16a372ff-8e02-41a4-abaa-fd24083c2e69',  -- Argus Eastbourne (unknown method)
    '963a02ac-0209-4cab-b655-b9a9779f7196'   -- The Argus (beautiful_soup method)
) AND scraping_method != 'rss';

-- Update feed URLs to use working RSS feeds where needed
UPDATE content_sources 
SET feed_url = CASE 
    WHEN id = '16a372ff-8e02-41a4-abaa-fd24083c2e69' THEN 'https://www.theargus.co.uk/news/rss/'
    WHEN id = '963a02ac-0209-4cab-b655-b9a9779f7196' THEN 'https://www.theargus.co.uk/news/rss/'
    ELSE feed_url 
END,
scraping_method = 'rss',
updated_at = now()
WHERE id IN ('16a372ff-8e02-41a4-abaa-fd24083c2e69', '963a02ac-0209-4cab-b655-b9a9779f7196');