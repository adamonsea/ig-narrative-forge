-- Queue Chamber articles for content generation
INSERT INTO content_generation_queue (article_id, topic_article_id, status, slidetype)
SELECT 
  a.id,
  ta.id,
  'pending',
  'default'
FROM articles a
JOIN content_sources cs ON a.source_id = cs.id
JOIN shared_article_content sac ON sac.url = a.source_url
JOIN topic_articles ta ON ta.shared_content_id = sac.id AND ta.topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
WHERE cs.feed_url ILIKE '%eastbourneunltd%'
  AND a.processing_status = 'new'
  AND NOT EXISTS (
    SELECT 1 FROM content_generation_queue cgq WHERE cgq.article_id = a.id
  );