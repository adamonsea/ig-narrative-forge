-- Step 1: Link Chamber articles to Eastbourne topic
UPDATE articles 
SET topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
WHERE source_id IN (
  SELECT id FROM content_sources 
  WHERE feed_url ILIKE '%eastbourneunltd%'
)
AND topic_id IS NULL
AND processing_status = 'new';

-- Step 2: Create shared_article_content entries for these articles (without ON CONFLICT)
INSERT INTO shared_article_content (url, normalized_url, title, body, author, published_at, image_url, source_domain, word_count)
SELECT 
  a.source_url,
  LOWER(TRIM(TRAILING '/' FROM REGEXP_REPLACE(a.source_url, '^https?://(www\.)?', ''))),
  a.title,
  a.body,
  a.author,
  COALESCE(a.published_at, a.created_at),
  a.image_url,
  'eastbourneunltd.co.uk',
  a.word_count
FROM articles a
JOIN content_sources cs ON a.source_id = cs.id
WHERE cs.feed_url ILIKE '%eastbourneunltd%'
  AND a.processing_status = 'new'
  AND NOT EXISTS (
    SELECT 1 FROM shared_article_content sac WHERE sac.url = a.source_url
  );