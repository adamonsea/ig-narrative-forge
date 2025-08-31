-- Mark the "Our Manifesto" article as discarded to prevent re-importing
UPDATE articles 
SET processing_status = 'discarded' 
WHERE title ILIKE '%manifesto%' 
AND processing_status = 'new';