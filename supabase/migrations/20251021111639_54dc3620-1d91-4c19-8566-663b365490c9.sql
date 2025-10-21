-- Fix Hastings topic region (handle both NULL and empty strings)
UPDATE topics 
SET region = 'Hastings' 
WHERE id = 'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa'
  AND (region IS NULL OR region = '');

-- Cleanup: Ensure all regional topics have valid region fields
-- Set region to topic name for any regional topics with empty/null regions
UPDATE topics 
SET region = name
WHERE topic_type = 'regional' 
  AND (region IS NULL OR region = '')