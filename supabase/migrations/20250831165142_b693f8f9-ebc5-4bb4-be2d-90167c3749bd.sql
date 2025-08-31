-- Retroactively assign topic IDs to articles that are missing them
-- This addresses the pipeline issue where articles weren't appearing due to missing topic_id

-- First, update articles from sources that have a topic_id assigned
UPDATE articles 
SET topic_id = cs.topic_id,
    updated_at = now()
FROM content_sources cs
WHERE articles.source_id = cs.id 
  AND articles.topic_id IS NULL 
  AND cs.topic_id IS NOT NULL;

-- Second, for remaining articles without topic_id, try to match by region
-- Find regional topics and assign articles from the same region
UPDATE articles 
SET topic_id = t.id,
    updated_at = now()
FROM topics t
WHERE articles.topic_id IS NULL
  AND articles.region = t.region 
  AND t.topic_type = 'regional'
  AND t.is_active = true;

-- Log the assignment operation
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Retroactively assigned topic IDs to articles missing them',
  jsonb_build_object(
    'migration_timestamp', now(),
    'source_based_assignments', (
      SELECT count(*) FROM articles a 
      JOIN content_sources cs ON a.source_id = cs.id 
      WHERE a.topic_id = cs.topic_id AND cs.topic_id IS NOT NULL
    ),
    'region_based_assignments', (
      SELECT count(*) FROM articles a 
      JOIN topics t ON a.topic_id = t.id 
      WHERE t.topic_type = 'regional' AND a.region = t.region
    )
  ),
  'retroactive_topic_assignment'
);