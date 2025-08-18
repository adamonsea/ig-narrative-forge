-- Fix stories stuck in processing status
UPDATE stories 
SET status = 'published' 
WHERE status = 'processing';