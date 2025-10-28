-- Phase 2: Consolidate Sussex Express duplicates for Eastbourne topic
-- This migration fixes the flooding issue by merging duplicate Sussex Express sources

-- Step 1: Reassign all articles from duplicate sources to the canonical source
UPDATE topic_articles 
SET source_id = '05c605ef-dc7f-4050-a296-b5c3310a7635'
WHERE source_id IN (
  '4669faf7-f57d-4a82-9d72-fa5119c51cc2',
  '01bc612c-513a-4860-b047-8f7c12f1ad8f'
)
AND topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';

-- Step 2: Deactivate duplicate sources in topic_sources junction table
UPDATE topic_sources
SET is_active = false
WHERE source_id IN (
  '4669faf7-f57d-4a82-9d72-fa5119c51cc2',
  '01bc612c-513a-4860-b047-8f7c12f1ad8f'
)
AND topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';

-- Step 3: Update the canonical source config to use the correct Eastbourne RSS feed
UPDATE topic_sources
SET source_config = jsonb_set(
  COALESCE(source_config, '{}'::jsonb),
  '{feed_url}',
  to_jsonb('https://www.sussexexpress.co.uk/news/local/eastbourne/rss'::text)
)
WHERE source_id = '05c605ef-dc7f-4050-a296-b5c3310a7635'
AND topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';

-- Step 4: Log the cleanup in system_logs for audit trail
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Consolidated Sussex Express duplicate sources for Eastbourne topic',
  jsonb_build_object(
    'topic_id', 'd224e606-1a4c-4713-8135-1d30e2d6d0c6',
    'canonical_source_id', '05c605ef-dc7f-4050-a296-b5c3310a7635',
    'deactivated_sources', ARRAY['4669faf7-f57d-4a82-9d72-fa5119c51cc2', '01bc612c-513a-4860-b047-8f7c12f1ad8f'],
    'new_feed_url', 'https://www.sussexexpress.co.uk/news/local/eastbourne/rss'
  ),
  'manual-migration'
);