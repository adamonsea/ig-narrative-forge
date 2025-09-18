-- Reset stuck queue items to retry with the fixed function
UPDATE content_generation_queue 
SET status = 'pending', 
    attempts = 0, 
    error_message = NULL, 
    started_at = NULL,
    completed_at = NULL
WHERE attempts >= max_attempts;