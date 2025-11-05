-- Phase 1: Quick Wins - Update BBC and Argus source configurations

-- Update BBC source to use universal scraper with trusted content relevance
UPDATE content_sources 
SET 
  scraping_method = 'universal-scraper',
  scraping_config = jsonb_build_object(
    'trust_content_relevance', true,
    'is_topic_page', true
  ),
  updated_at = now()
WHERE id = '7bc110f6-342c-4eb2-967e-6e63d79cb283'
  AND source_name ILIKE '%bbc%';

-- Update Argus to use universal scraper
UPDATE content_sources 
SET 
  scraping_method = 'universal-scraper',
  updated_at = now()
WHERE id = '16a372ff-8e02-41a4-abaa-fd24083c2e69'
  AND source_name ILIKE '%argus%';

-- Log the changes
DO $$
BEGIN
  RAISE NOTICE 'BBC source updated to use universal-scraper with trusted content relevance';
  RAISE NOTICE 'Argus source updated to use universal-scraper';
END $$;