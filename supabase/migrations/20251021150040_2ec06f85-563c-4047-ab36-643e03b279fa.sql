-- Backfill import_metadata for existing parliamentary topic_articles
-- This ensures all parliamentary content is consistently excluded from Arrivals

-- Backfill daily parliamentary votes
UPDATE topic_articles ta
SET import_metadata = COALESCE(ta.import_metadata, '{}'::jsonb) || 
  jsonb_build_object('parliamentary_vote', true, 'source', 'parliamentary_vote')
WHERE EXISTS (
  SELECT 1 FROM stories s
  WHERE s.topic_article_id = ta.id
    AND s.is_parliamentary = true
)
AND (ta.import_metadata IS NULL 
  OR ta.import_metadata->>'source' IS NULL 
  OR ta.import_metadata->>'source' != 'parliamentary_vote');

-- Backfill weekly parliamentary roundups (if they exist)
-- Identify by checking if topic_article has is_parliamentary story and import_metadata.weekly_roundup = true
UPDATE topic_articles ta
SET import_metadata = COALESCE(ta.import_metadata, '{}'::jsonb) || 
  jsonb_build_object('source', 'parliamentary_weekly_roundup')
WHERE EXISTS (
  SELECT 1 FROM stories s
  WHERE s.topic_article_id = ta.id
    AND s.is_parliamentary = true
)
AND ta.import_metadata->>'weekly_roundup' = 'true'
AND (ta.import_metadata->>'source' IS NULL 
  OR ta.import_metadata->>'source' != 'parliamentary_weekly_roundup');

-- Log the backfill
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Backfilled import_metadata for parliamentary topic_articles',
  jsonb_build_object(
    'daily_votes_tagged', 'parliamentary_vote',
    'weekly_roundups_tagged', 'parliamentary_weekly_roundup',
    'purpose', 'Deterministic exclusion from Arrivals UI'
  ),
  'backfill_parliamentary_metadata'
);