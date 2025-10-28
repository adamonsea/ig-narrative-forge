-- First, set source_id to NULL for articles referencing sources we'll delete
UPDATE articles
SET source_id = NULL
WHERE source_id IN (
  SELECT id FROM content_sources
  WHERE is_active = false 
     OR (articles_scraped = 0 AND last_scraped_at IS NULL)
     OR last_scraped_at < NOW() - INTERVAL '30 days'
);

-- Then delete the non-performing sources
DELETE FROM content_sources
WHERE is_active = false 
   OR (articles_scraped = 0 AND last_scraped_at IS NULL)
   OR last_scraped_at < NOW() - INTERVAL '30 days';