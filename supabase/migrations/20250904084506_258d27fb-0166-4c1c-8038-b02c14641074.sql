-- Create sentiment settings for the 'AI for agency' topic with correct data types
INSERT INTO topic_sentiment_settings (
  topic_id,
  enabled,
  excluded_keywords,
  analysis_frequency_hours,
  created_at,
  updated_at
) 
SELECT 
  id,
  true,
  '{}'::text[],  -- Use text array instead of jsonb
  24,
  now(),
  now()
FROM topics 
WHERE slug = 'ai-for-agency'
ON CONFLICT (topic_id) DO UPDATE SET
  enabled = true,
  updated_at = now();