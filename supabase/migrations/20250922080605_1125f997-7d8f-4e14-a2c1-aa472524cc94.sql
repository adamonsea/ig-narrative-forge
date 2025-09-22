-- Migrate ready stories to published status
UPDATE stories 
SET status = 'published', 
    is_published = true, 
    updated_at = now()
WHERE status = 'ready' AND is_published = false;