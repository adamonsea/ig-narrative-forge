-- Fix failed RSS feeds with correct working URLs
UPDATE content_sources 
SET feed_url = 'https://feeds.reuters.com/reuters/UKNews' 
WHERE source_name = 'Reuters' AND feed_url = 'https://feeds.reuters.com/reuters/UKdomesticNews';

-- Update ITV Meridian feed URL (the current one appears to have issues)
UPDATE content_sources 
SET feed_url = 'https://www.itv.com/news/meridian/rss' 
WHERE source_name = 'itv.com' AND feed_url = 'https://www.itv.com/news/meridian/feed.xml';

-- Remove More Radio Online as it doesn't appear to have a proper RSS feed
UPDATE content_sources 
SET is_active = false 
WHERE source_name = 'moreradio.online' AND feed_url = 'https://moreradio.online/eastbourne';