-- Emergency cleanup: Remove misplaced medical articles, invalid dates, and old articles
-- Safe version: Only delete topic_articles that have no stories attached

-- 1. Delete medical device articles incorrectly linked to Eastbourne (only if no stories)
DELETE FROM topic_articles
WHERE id IN (
  SELECT ta.id
  FROM topic_articles ta
  JOIN topics t ON t.id = ta.topic_id
  JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  WHERE t.name = 'Eastbourne'
    AND ta.processing_status = 'new'
    AND NOT EXISTS (SELECT 1 FROM stories WHERE topic_article_id = ta.id)
    AND (
      sac.title ILIKE '%FDA%' OR
      sac.title ILIKE '%medical device%' OR
      sac.title ILIKE '%clinical trial%' OR
      (sac.title ILIKE '%therapy%' AND sac.title NOT ILIKE '%physiotherapy%') OR
      sac.title ILIKE '%surgical%' OR
      sac.title ILIKE '%implant%' OR
      sac.title ILIKE '%gene therapy%' OR
      sac.title ILIKE '%stem cell%'
    )
);

-- 2. Delete articles with future or invalid dates (only if not referenced)
DELETE FROM shared_article_content
WHERE (published_at > NOW() OR published_at < '2020-01-01'::timestamp)
  AND NOT EXISTS (SELECT 1 FROM topic_articles WHERE shared_content_id = shared_article_content.id);

-- 3. Delete old articles from Eastbourne (older than 3 days in 'new' status, no stories)
DELETE FROM topic_articles
WHERE id IN (
  SELECT ta.id
  FROM topic_articles ta
  JOIN topics t ON t.id = ta.topic_id
  JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  WHERE t.name = 'Eastbourne'
    AND ta.processing_status = 'new'
    AND sac.published_at < NOW() - INTERVAL '3 days'
    AND NOT EXISTS (SELECT 1 FROM stories WHERE topic_article_id = ta.id)
);

-- 4. Delete old articles from Hastings (older than 7 days in 'new' status, no stories)
DELETE FROM topic_articles
WHERE id IN (
  SELECT ta.id
  FROM topic_articles ta
  JOIN topics t ON t.id = ta.topic_id
  JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  WHERE t.name = 'Hastings'
    AND ta.processing_status = 'new'
    AND sac.published_at < NOW() - INTERVAL '7 days'
    AND NOT EXISTS (SELECT 1 FROM stories WHERE topic_article_id = ta.id)
);

-- 5. Delete old articles from Medical Devices (older than 7 days in 'new' status, no stories)
DELETE FROM topic_articles
WHERE id IN (
  SELECT ta.id
  FROM topic_articles ta
  JOIN topics t ON t.id = ta.topic_id
  JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  WHERE t.name = 'Medical Devices'
    AND ta.processing_status = 'new'
    AND sac.published_at < NOW() - INTERVAL '7 days'
    AND NOT EXISTS (SELECT 1 FROM stories WHERE topic_article_id = ta.id)
);

-- Add max_article_age_days column for per-topic age filtering
ALTER TABLE topics
ADD COLUMN IF NOT EXISTS max_article_age_days INTEGER DEFAULT 7;

COMMENT ON COLUMN topics.max_article_age_days IS 'Maximum age in days for articles to be considered for this topic. Enforced during scraping.';

-- Set specific age limits per topic
UPDATE topics SET max_article_age_days = 3 WHERE name = 'Eastbourne';
UPDATE topics SET max_article_age_days = 7 WHERE name IN ('Hastings', 'Medical Devices');

-- Log the cleanup
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Emergency cleanup: Removed misplaced and old articles, added age limits',
  jsonb_build_object(
    'cleanup_type', 'safe_orphaned_cleanup',
    'eastbourne_max_age', 3,
    'hastings_max_age', 7,
    'medical_devices_max_age', 7,
    'timestamp', NOW()
  ),
  'cleanup_migration'
);