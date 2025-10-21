-- Universal fix: Link existing Hastings sources via topic_sources junction table
-- This ensures the universal-topic-scraper can discover them

-- Step 1: Link all Hastings-related sources to Hastings topic via junction table
INSERT INTO topic_sources (topic_id, source_id, is_active, source_config, created_at)
SELECT 
  'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa' as topic_id,
  cs.id as source_id,
  true as is_active,
  jsonb_build_object(
    'migration_linked', true,
    'linked_at', now(),
    'reason', 'backfill_hastings_sources',
    'auto_discovered', false
  ) as source_config,
  now() as created_at
FROM content_sources cs
WHERE (
    cs.source_name ILIKE '%hastings%'
    OR cs.feed_url ILIKE '%hastings%'
    OR cs.canonical_domain ILIKE '%hastings%'
  )
  AND cs.created_at >= '2025-10-21 10:00:00'
  AND cs.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM topic_sources ts 
    WHERE ts.source_id = cs.id 
    AND ts.topic_id = 'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa'
  )
ON CONFLICT (topic_id, source_id) DO NOTHING;

-- Step 2: Ensure automation is enabled for Hastings topic
INSERT INTO topic_automation_settings (
  topic_id,
  scrape_frequency_hours,
  is_active,
  auto_simplify_enabled,
  quality_threshold,
  created_at
) VALUES (
  'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa',
  12,
  true,
  false,
  60,
  now()
)
ON CONFLICT (topic_id) DO UPDATE SET
  is_active = true,
  scrape_frequency_hours = 12,
  updated_at = now();

-- Step 3: Log the migration for audit trail
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Universal fix applied: Linked Hastings sources via junction table',
  jsonb_build_object(
    'topic_id', 'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa',
    'topic_name', 'Hastings',
    'migration_type', 'backfill_junction_table',
    'sources_pattern', 'hastings-related',
    'automation_enabled', true,
    'architecture', 'multi_tenant_junction_table'
  ),
  'link_hastings_sources_junction'
);