-- Disable strict scope for all Eastbourne topic sources to enable RSS fallbacks
UPDATE topic_sources
SET source_config = COALESCE(source_config, '{}'::jsonb) || '{"strictScope": false}'::jsonb
WHERE topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';