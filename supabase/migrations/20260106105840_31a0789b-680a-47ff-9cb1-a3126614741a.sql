-- Fix 1: Update invalid slidetype values from 'default' to 'tabloid'
UPDATE content_generation_queue 
SET slidetype = 'tabloid'
WHERE slidetype = 'default' OR slidetype IS NULL;

-- Fix 2: Reset failed jobs so they can be retried
UPDATE content_generation_queue 
SET status = 'pending',
    error_message = NULL,
    attempts = 0,
    started_at = NULL
WHERE error_message IS NOT NULL
  OR status = 'processing';