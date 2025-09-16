-- Restore the Argus source to the Eastbourne topic
INSERT INTO topic_sources (topic_id, source_id, is_active, source_config)
VALUES (
  'd224e606-1a4c-4713-8135-1d30e2d6d0c6', -- Eastbourne topic ID
  '16a372ff-8e02-41a4-abaa-fd24083c2e69', -- Consolidated Argus source ID
  true,
  jsonb_build_object(
    'restored_after_consolidation', true,
    'consolidation_date', now(),
    'feed_updated_to_eastbourne_index', true
  )
)
ON CONFLICT (topic_id, source_id) DO UPDATE SET
  is_active = true,
  source_config = jsonb_build_object(
    'restored_after_consolidation', true,
    'consolidation_date', now(),
    'feed_updated_to_eastbourne_index', true
  ),
  updated_at = now();