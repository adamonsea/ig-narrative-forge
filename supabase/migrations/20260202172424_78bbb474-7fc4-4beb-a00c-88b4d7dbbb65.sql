-- Fix inconsistent processing_status: topic_articles with published stories should not be 'new'
UPDATE topic_articles ta
SET processing_status = 'processed', updated_at = NOW()
FROM stories s
WHERE s.topic_article_id = ta.id
AND ta.processing_status = 'new'
AND s.status IN ('ready', 'published');

-- Clean up completed queue entries older than 1 hour (they're just noise)
DELETE FROM content_generation_queue
WHERE status = 'completed'
AND completed_at < NOW() - INTERVAL '1 hour';