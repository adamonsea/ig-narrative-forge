-- Enable social proof cards for all active topics
UPDATE topic_insight_settings
SET 
  social_proof_enabled = true,
  updated_at = NOW()
WHERE topic_id IN (
  SELECT id 
  FROM topics 
  WHERE is_active = true AND is_archived = false
);