
-- Enable all premium features for adamonsea@gmail.com's topics
UPDATE topic_insight_settings
SET 
  story_momentum_enabled = true,
  social_proof_enabled = true,
  play_mode_enabled = true,
  quiz_cards_enabled = true
WHERE topic_id IN (
  SELECT id FROM topics 
  WHERE created_by = 'c8284651-7ca9-407d-99ac-85c19cbe212c'
);

-- Disable premium features for all other accounts
UPDATE topic_insight_settings
SET 
  story_momentum_enabled = false,
  social_proof_enabled = false,
  play_mode_enabled = false,
  quiz_cards_enabled = false
WHERE topic_id IN (
  SELECT id FROM topics 
  WHERE created_by != 'c8284651-7ca9-407d-99ac-85c19cbe212c'
);
