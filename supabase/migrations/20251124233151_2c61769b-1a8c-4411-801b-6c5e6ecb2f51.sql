-- ============================================
-- REACTIVATE EASTBOURNE SOURCES
-- ============================================

-- Reactivate the three key Eastbourne sources that were incorrectly deactivated
UPDATE public.content_sources
SET 
  is_active = true,
  consecutive_failures = 0,
  total_failures = 0,
  last_failure_reason = NULL,
  last_failure_at = NULL,
  updated_at = now()
WHERE source_name IN ('bournefreelive.co.uk', 'eastbourne.news', 'sussex.press');

-- Mark bournefreelive.co.uk as critical (primary Eastbourne source)
UPDATE public.content_sources
SET is_critical = true
WHERE source_name = 'bournefreelive.co.uk';

-- Log the reactivation
INSERT INTO public.system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Reactivated Eastbourne sources',
  jsonb_build_object(
    'sources', ARRAY['bournefreelive.co.uk', 'eastbourne.news', 'sussex.press'],
    'reason', 'Sources were incorrectly deactivated causing Eastbourne feed drop-off',
    'marked_critical', 'bournefreelive.co.uk',
    'fix_type', 'migration_reactivation'
  ),
  'reactivate_eastbourne_migration'
);