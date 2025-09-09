-- Update source URLs to use RSS feeds for better content extraction
UPDATE content_sources 
SET feed_url = 'https://www.hastings-observer.co.uk/rss'
WHERE source_name = 'Hastings Observer' 
  AND feed_url != 'https://www.hastings-observer.co.uk/rss';

UPDATE content_sources 
SET feed_url = 'https://www.theargus.co.uk/news/hastings/rss/'
WHERE source_name = 'Argus Hastings' 
  AND feed_url != 'https://www.theargus.co.uk/news/hastings/rss/';

-- Update last scraped time to force re-scraping
UPDATE content_sources 
SET last_scraped_at = NULL, 
    updated_at = now()
WHERE source_name IN ('Hastings Observer', 'Argus Hastings');