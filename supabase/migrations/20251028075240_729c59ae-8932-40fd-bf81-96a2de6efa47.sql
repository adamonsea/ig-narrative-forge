-- Fix Argus feed URLs in topic_sources junction table
-- These were incorrectly set to root domain during consolidation

-- 1. Eastbourne topic - fix Argus Eastbourne Local News source
UPDATE topic_sources
SET source_config = jsonb_set(
  COALESCE(source_config, '{}'::jsonb),
  '{feed_url}',
  '"https://www.theargus.co.uk/local-news/eastbourne-news/"'::jsonb
)
WHERE topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
  AND source_id = '16a372ff-8e02-41a4-abaa-fd24083c2e69';

-- 2. Brighton topic - bulk align all Argus sources to their correct URLs from content_sources
UPDATE topic_sources ts
SET source_config = jsonb_set(
  COALESCE(ts.source_config, '{}'::jsonb),
  '{feed_url}',
  to_jsonb(cs.feed_url::text)
)
FROM content_sources cs
WHERE ts.source_id = cs.id
  AND ts.topic_id = '0dc1da67-2975-4a42-af18-556ecb286398'
  AND (cs.canonical_domain ILIKE '%theargus%' OR cs.source_name ILIKE '%argus%');