-- Reset stuck queue items to allow retry with fresh attempts
UPDATE content_generation_queue 
SET attempts = 0, 
    error_message = NULL,
    status = 'pending' 
WHERE status = 'pending' 
  AND attempts >= max_attempts 
  AND error_message = 'Edge Function returned a non-2xx status code';

-- Also clean up any very old stuck items (more than 24 hours old)
DELETE FROM content_generation_queue 
WHERE created_at < now() - INTERVAL '24 hours' 
  AND attempts >= max_attempts;