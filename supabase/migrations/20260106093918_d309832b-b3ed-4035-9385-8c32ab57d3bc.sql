-- Step 3: Create topic_articles entries linking shared content to Eastbourne topic
INSERT INTO topic_articles (shared_content_id, topic_id, source_id, processing_status, regional_relevance_score, content_quality_score)
SELECT 
  sac.id,
  'd224e606-1a4c-4713-8135-1d30e2d6d0c6',
  a.source_id,
  'new',
  90,
  80
FROM articles a
JOIN content_sources cs ON a.source_id = cs.id
JOIN shared_article_content sac ON sac.url = a.source_url
WHERE cs.feed_url ILIKE '%eastbourneunltd%'
  AND a.processing_status = 'new'
  AND NOT EXISTS (
    SELECT 1 FROM topic_articles ta 
    WHERE ta.shared_content_id = sac.id 
    AND ta.topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
  );