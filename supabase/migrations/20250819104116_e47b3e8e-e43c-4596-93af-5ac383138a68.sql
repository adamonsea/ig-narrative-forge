-- Fix broken source URLs for better scraping
UPDATE content_sources 
SET feed_url = 'https://feeds.reuters.com/reuters/UKdomesticNews'
WHERE source_name = 'Reuters' AND feed_url = 'https://feeds.reuters.com/reuters/topNews';

UPDATE content_sources 
SET feed_url = 'https://www.itv.com/news/meridian/feed.xml'
WHERE source_name = 'itv.com' AND feed_url = 'https://itv.com/news/topic/eastbourne';

UPDATE content_sources 
SET feed_url = 'https://feeds.bbci.co.uk/news/england/south_east/rss.xml'
WHERE source_name = 'bbc.co.uk' AND feed_url = 'https://bbc.co.uk/bbcsussex';

UPDATE content_sources 
SET feed_url = 'https://bournefreelive.co.uk/feed/'
WHERE source_name = 'bournefreelive.co.uk' AND feed_url = 'https://bournefreelive.co.uk/?utm_source=chatgpt.com';

UPDATE content_sources 
SET feed_url = 'https://eastbourne.news/feed/'
WHERE source_name = 'eastbourne.news' AND feed_url = 'https://eastbourne.news/?utm_source=chatgpt.com';

UPDATE content_sources 
SET feed_url = 'https://www.eastbournereporter.co.uk/rss/'
WHERE source_name = 'eastbournereporter.co.uk' AND feed_url = 'https://www.eastbournereporter.co.uk/';

UPDATE content_sources 
SET feed_url = 'https://eastsussex.news/feed/'
WHERE source_name = 'eastsussex.news' AND feed_url = 'https://eastsussex.news/?utm_source=chatgpt.com';