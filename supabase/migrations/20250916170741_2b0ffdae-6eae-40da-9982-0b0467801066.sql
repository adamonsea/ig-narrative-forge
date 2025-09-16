-- Phase 4: Update The Argus to use Brighton-focused feed URL
-- This improves content relevance for Brighton topics by using a more targeted RSS feed

UPDATE content_sources 
SET feed_url = 'https://www.theargus.co.uk/news/local/brighton_hove/'
WHERE source_name = 'theargus.co.uk' 
  AND feed_url = 'https://www.theargus.co.uk/'
  AND canonical_domain = 'theargus.co.uk';

-- Log the update for tracking
INSERT INTO system_logs (level, message, context, function_name, created_at)
VALUES (
  'info',
  'Updated The Argus source to use Brighton-focused RSS feed',
  jsonb_build_object(
    'old_url', 'https://www.theargus.co.uk/',
    'new_url', 'https://www.theargus.co.uk/news/local/brighton_hove/',
    'reason', 'Brighton content collection improvement - Phase 4'
  ),
  'brighton_content_fix_migration',
  now()
);