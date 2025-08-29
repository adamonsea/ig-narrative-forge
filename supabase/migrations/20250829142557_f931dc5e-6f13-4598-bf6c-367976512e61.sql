-- Update recent articles that should belong to the "Film for Kids" topic
-- This will help recover articles that were scraped but missing topic_id

-- Find articles from sources that are associated with the "Film for Kids" topic
UPDATE articles 
SET topic_id = (
  SELECT t.id 
  FROM topics t 
  WHERE t.name = 'Film for Kids' 
  LIMIT 1
)
WHERE topic_id IS NULL 
  AND created_at >= NOW() - INTERVAL '24 hours'
  AND (
    title ILIKE '%film%' 
    OR title ILIKE '%movie%' 
    OR title ILIKE '%cinema%'
    OR title ILIKE '%kids%'
    OR title ILIKE '%child%'
    OR body ILIKE '%film%'
    OR body ILIKE '%movie%'
    OR body ILIKE '%cinema%'
  );

-- Log the update
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Migrated recent articles to Film for Kids topic',
  jsonb_build_object(
    'updated_count', (
      SELECT COUNT(*) 
      FROM articles 
      WHERE topic_id = (SELECT id FROM topics WHERE name = 'Film for Kids' LIMIT 1)
        AND created_at >= NOW() - INTERVAL '24 hours'
    )
  ),
  'topic_migration_fix'
);