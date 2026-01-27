-- Deactivate all sources except Eastbourne topic
UPDATE content_sources 
SET is_active = false
WHERE topic_id != 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';

-- Set all topics except Eastbourne to inactive
UPDATE topics 
SET is_active = false
WHERE id != 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';

-- Cancel any pending/queued scrape jobs for non-Eastbourne topics
UPDATE scrape_jobs 
SET status = 'cancelled'
WHERE status IN ('pending', 'queued')
AND source_id IN (
  SELECT id FROM content_sources 
  WHERE topic_id != 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
);

-- Cancel any pending content generation queue items for non-Eastbourne
UPDATE content_generation_queue
SET status = 'cancelled'
WHERE status = 'pending'
AND topic_article_id IN (
  SELECT id FROM topic_articles 
  WHERE topic_id != 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
);