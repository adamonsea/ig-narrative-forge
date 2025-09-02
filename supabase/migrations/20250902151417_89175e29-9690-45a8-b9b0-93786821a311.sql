-- Fix broken RSS feed URLs for failing Meditech sources
UPDATE content_sources 
SET feed_url = 'https://www.healthcareitnews.com/feed',
    updated_at = now()
WHERE canonical_domain = 'healthcareitnews.com' 
AND topic_id = 'c5bba557-e190-41c2-ae1e-2b3fb7db3892';

UPDATE content_sources 
SET feed_url = 'https://www.bioworld.com/rss.xml',
    updated_at = now()
WHERE canonical_domain = 'bioworld.com' 
AND topic_id = 'c5bba557-e190-41c2-ae1e-2b3fb7db3892';

UPDATE content_sources 
SET feed_url = 'https://www.fiercebiotech.com/rss.xml',
    updated_at = now()
WHERE canonical_domain = 'fiercebiotech.com' 
AND topic_id = 'c5bba557-e190-41c2-ae1e-2b3fb7db3892';

-- Deactivate consistently failing sources (0% success rate)
UPDATE content_sources 
SET is_active = false,
    updated_at = now()
WHERE topic_id = 'c5bba557-e190-41c2-ae1e-2b3fb7db3892'
AND success_rate = 0.00
AND articles_scraped >= 2;