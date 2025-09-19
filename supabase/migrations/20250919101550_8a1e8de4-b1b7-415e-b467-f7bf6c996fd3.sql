-- Step 1: Publish recent draft stories (created today)
UPDATE stories 
SET status = 'published', 
    is_published = true,
    updated_at = now()
WHERE status = 'draft' 
  AND created_at >= CURRENT_DATE
  AND is_published = false;

-- Step 2: Clean up old discarded articles (older than 7 days) from legacy table
-- First, preserve URLs in discarded_articles table for suppression
INSERT INTO discarded_articles (
  topic_id,
  url,
  normalized_url,
  title,
  discarded_by,
  discarded_reason,
  discarded_at
)
SELECT 
  a.topic_id,
  a.source_url,
  normalize_url(a.source_url),
  a.title,
  NULL,
  'database_cleanup', 
  now()
FROM articles a
WHERE a.processing_status = 'discarded' 
  AND a.created_at < now() - INTERVAL '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM discarded_articles da 
    WHERE da.normalized_url = normalize_url(a.source_url) 
    AND da.topic_id = a.topic_id
  )
ON CONFLICT (topic_id, normalized_url) DO UPDATE SET
  discarded_at = now(),
  discarded_reason = 'database_cleanup';

-- Delete old discarded articles from legacy table  
DELETE FROM articles 
WHERE processing_status = 'discarded' 
  AND created_at < now() - INTERVAL '7 days';

-- Step 3: Clean up old discarded topic_articles (older than 7 days)
-- First, preserve URLs in discarded_articles table
INSERT INTO discarded_articles (
  topic_id,
  url,
  normalized_url,
  title,
  discarded_by,
  discarded_reason,
  discarded_at
)
SELECT 
  ta.topic_id,
  sac.url,
  sac.normalized_url,
  sac.title,
  NULL,
  'database_cleanup',
  now()
FROM topic_articles ta
JOIN shared_article_content sac ON ta.shared_content_id = sac.id
WHERE ta.processing_status = 'discarded' 
  AND ta.created_at < now() - INTERVAL '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM discarded_articles da 
    WHERE da.normalized_url = sac.normalized_url 
    AND da.topic_id = ta.topic_id
  )
ON CONFLICT (topic_id, normalized_url) DO UPDATE SET
  discarded_at = now(),
  discarded_reason = 'database_cleanup';

-- Delete old discarded topic_articles
DELETE FROM topic_articles 
WHERE processing_status = 'discarded' 
  AND created_at < now() - INTERVAL '7 days';