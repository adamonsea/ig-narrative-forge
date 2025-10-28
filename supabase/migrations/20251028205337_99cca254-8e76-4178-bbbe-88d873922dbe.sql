-- Disable parliamentary tracking for Eastbourne topic
UPDATE topics 
SET parliamentary_tracking_enabled = false, 
    updated_at = now() 
WHERE slug = 'eastbourne';

-- Unpublish all parliamentary stories
UPDATE stories 
SET is_published = false, 
    status = 'draft',
    updated_at = now()
WHERE id IN (
  SELECT story_id 
  FROM parliamentary_mentions 
  WHERE topic_id = (SELECT id FROM topics WHERE slug = 'eastbourne')
  AND story_id IS NOT NULL
);