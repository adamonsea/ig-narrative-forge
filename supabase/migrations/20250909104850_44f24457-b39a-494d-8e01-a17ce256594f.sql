-- Fix the invalid feed URL that's missing protocol
UPDATE content_sources 
SET feed_url = 'https://storylab.ai/feed',
    updated_at = now()
WHERE feed_url = 'storylab.ai/feed' OR canonical_domain = 'storylab.ai';

-- Add validation to ensure all feed URLs have proper protocols
UPDATE content_sources 
SET feed_url = CASE 
  WHEN feed_url ~ '^https?://' THEN feed_url
  WHEN feed_url IS NOT NULL AND length(feed_url) > 0 THEN 'https://' || feed_url
  ELSE feed_url
END,
updated_at = now()
WHERE feed_url IS NOT NULL 
  AND feed_url != '' 
  AND feed_url !~ '^https?://';

-- Log the cleanup
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Fixed content source URLs missing protocols',
  jsonb_build_object(
    'cleanup_type', 'url_protocol_fix',
    'timestamp', now()
  ),
  'fix_source_urls'
);