-- Add domain profiles for all Newsquest family domains
-- First delete any existing profiles for these domains to avoid conflicts
DELETE FROM scraper_domain_profiles 
WHERE domain_key IN (
  'theargus.co.uk',
  'sussexexpress.co.uk', 
  'crawleyobserver.co.uk',
  'brightonandhoveindependent.co.uk',
  'hastingsobserver.co.uk',
  'hastingsindependentpress.co.uk'
) AND tenant_id IS NULL AND topic_id IS NULL;

-- Now insert the Newsquest domain profiles
INSERT INTO scraper_domain_profiles (domain_key, profile, tenant_id, topic_id)
VALUES 
  ('theargus.co.uk', '{"family": "newsquest", "accessibility": {"bypassHead": true}}', NULL, NULL),
  ('sussexexpress.co.uk', '{"family": "newsquest", "accessibility": {"bypassHead": true}}', NULL, NULL),
  ('crawleyobserver.co.uk', '{"family": "newsquest", "accessibility": {"bypassHead": true}}', NULL, NULL),
  ('brightonandhoveindependent.co.uk', '{"family": "newsquest", "accessibility": {"bypassHead": true}}', NULL, NULL),
  ('hastingsobserver.co.uk', '{"family": "newsquest", "accessibility": {"bypassHead": true}}', NULL, NULL),
  ('hastingsindependentpress.co.uk', '{"family": "newsquest", "accessibility": {"bypassHead": true}}', NULL, NULL);