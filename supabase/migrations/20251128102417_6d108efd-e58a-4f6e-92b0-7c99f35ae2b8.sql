
-- Enable all premium features for topics owned by adamonsea@gmail.com
UPDATE topic_insight_settings
SET 
  play_mode_enabled = true,
  quiz_cards_enabled = true,
  social_proof_enabled = true,
  story_momentum_enabled = true,
  updated_at = now()
WHERE topic_id IN (
  SELECT t.id 
  FROM topics t
  WHERE t.created_by = 'c8284651-7ca9-407d-99ac-85c19cbe212c'
);
