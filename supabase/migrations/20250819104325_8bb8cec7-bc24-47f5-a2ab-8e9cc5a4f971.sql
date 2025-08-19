-- Reset stalled processing stories to allow retry
UPDATE stories 
SET status = 'draft', updated_at = now() 
WHERE status = 'processing' 
  AND updated_at < now() - interval '10 minutes';

-- Also reset any articles stuck in processing to allow fresh processing
UPDATE articles 
SET processing_status = 'new' 
WHERE processing_status = 'processing' 
  AND updated_at < now() - interval '10 minutes';