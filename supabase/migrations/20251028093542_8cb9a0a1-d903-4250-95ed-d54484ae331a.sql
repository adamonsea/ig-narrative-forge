-- Safely clean up duplicate topic_sources entries only
-- Keep the most recently created link for each topic + canonical_domain pair

WITH duplicate_sources AS (
  SELECT 
    ts.id,
    ts.topic_id,
    cs.canonical_domain,
    ROW_NUMBER() OVER (
      PARTITION BY ts.topic_id, cs.canonical_domain 
      ORDER BY ts.created_at DESC
    ) as rn
  FROM topic_sources ts
  JOIN content_sources cs ON cs.id = ts.source_id
)
DELETE FROM topic_sources
WHERE id IN (
  SELECT id FROM duplicate_sources WHERE rn > 1
);