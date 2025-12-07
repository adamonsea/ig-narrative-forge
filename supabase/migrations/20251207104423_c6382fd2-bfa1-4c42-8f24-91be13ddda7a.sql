-- Clean up old failed scrape jobs from before the universal-topic-scraper migration
-- These jobs failed due to the old broken hybrid-scraper path and are just noise

DELETE FROM scrape_jobs 
WHERE status = 'failed' 
  AND created_at < '2025-12-06 18:00:00+00';