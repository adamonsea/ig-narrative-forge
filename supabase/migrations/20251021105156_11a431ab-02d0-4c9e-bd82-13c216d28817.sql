-- Fix existing Hastings topic to have correct region field
UPDATE topics 
SET region = 'Hastings' 
WHERE id = 'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa'
  AND region IS NULL;