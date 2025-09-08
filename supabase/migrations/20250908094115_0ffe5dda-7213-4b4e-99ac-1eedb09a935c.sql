-- Update The Argus source to use correct RSS feed URL
UPDATE content_sources 
SET feed_url = 'https://www.theargus.co.uk/news/rss/'
WHERE id = '10c6ff62-c84a-4ad1-b3d0-4b911ce86474' AND canonical_domain = 'theargus.co.uk';