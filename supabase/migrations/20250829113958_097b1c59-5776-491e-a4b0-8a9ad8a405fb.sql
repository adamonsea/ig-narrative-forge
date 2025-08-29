-- Fix the Leo's PlayDen story status and article processing status
UPDATE stories 
SET status = 'ready', updated_at = now() 
WHERE article_id = 'd0261784-d093-4e39-ad06-5d3ece77056c';

UPDATE articles 
SET processing_status = 'processed', updated_at = now() 
WHERE id = 'd0261784-d093-4e39-ad06-5d3ece77056c';