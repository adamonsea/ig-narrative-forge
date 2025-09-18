-- Phase 4.1: Database Consistency Hotfix
-- Sync is_published boolean field with status field

UPDATE stories 
SET is_published = true 
WHERE status = 'published' AND is_published = false;

-- Log the consistency fix
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Phase 4.1: Synced is_published field with status field',
  jsonb_build_object(
    'updated_stories', (SELECT count(*) FROM stories WHERE status = 'published' AND is_published = false),
    'total_published_stories', (SELECT count(*) FROM stories WHERE status = 'published')
  ),
  'phase_4_1_consistency_hotfix'
);