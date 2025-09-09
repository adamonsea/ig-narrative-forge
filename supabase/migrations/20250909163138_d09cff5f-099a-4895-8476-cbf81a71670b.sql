-- Fix orphaned Argus source that wasn't properly linked to Eastbourne topic
INSERT INTO topic_sources (topic_id, source_id, is_active, source_config)
VALUES (
    'd224e606-1a4c-4713-8135-1d30e2d6d0c6'::uuid,  -- Eastbourne topic ID
    '963a02ac-0209-4cab-b655-b9a9779f7196'::uuid,  -- The Argus source ID that was created but not linked
    true,
    '{}'::jsonb
)
ON CONFLICT (topic_id, source_id) 
DO UPDATE SET 
    is_active = true,
    updated_at = now();