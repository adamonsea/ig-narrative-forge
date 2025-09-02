-- Fix orphaned medtech sources by associating them with the meditech topic
UPDATE content_sources 
SET topic_id = 'c5bba557-e190-41c2-ae1e-2b3fb7db3892', updated_at = now()
WHERE topic_id IS NULL 
AND (
  canonical_domain ILIKE '%medtech%' OR 
  canonical_domain ILIKE '%healthcare%' OR 
  canonical_domain ILIKE '%biotech%' OR 
  canonical_domain ILIKE '%medgadget%' OR 
  canonical_domain ILIKE '%massdevice%' OR
  source_name ILIKE '%medtech%' OR
  source_name ILIKE '%healthcare%' OR
  source_name ILIKE '%biotech%' OR
  source_name ILIKE '%medgadget%' OR
  source_name ILIKE '%massdevice%'
);