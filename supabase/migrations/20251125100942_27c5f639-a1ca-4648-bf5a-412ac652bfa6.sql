-- Enable social proof for Eastbourne and set as premium tier for testing
UPDATE topic_insight_settings 
SET 
  social_proof_enabled = true,
  is_premium_tier = true,
  updated_at = now()
WHERE topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';