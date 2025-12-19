-- Fix the 12-slide story status inconsistency
UPDATE stories 
SET status = 'published', updated_at = now()
WHERE id = '7a5e98a9-5eba-4b24-b9b3-a1faa24c6b62';

-- Also fix any other stories with is_published=true but status='ready'
UPDATE stories 
SET status = 'published', updated_at = now()
WHERE is_published = true AND status = 'ready';