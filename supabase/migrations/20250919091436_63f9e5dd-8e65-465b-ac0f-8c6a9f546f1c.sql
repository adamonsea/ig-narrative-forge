-- Reset failed queue items that had schema errors so they can retry
UPDATE content_generation_queue 
SET attempts = 0, 
    error_message = NULL, 
    status = 'pending' 
WHERE attempts >= max_attempts 
  AND error_message LIKE '%2xx status code%';