-- Add domain profiles for all Newsquest sources
INSERT INTO scraper_domain_profiles (domain_key, profile, tenant_id, topic_id)
VALUES 
  ('hastingsobserver.co.uk', '{"family": "newsquest", "accessibility": {"bypassHead": true}}', NULL, NULL),
  ('hastingsindependentpress.co.uk', '{"family": "newsquest", "accessibility": {"bypassHead": true}}', NULL, NULL),
  ('crawleyobserver.co.uk', '{"family": "newsquest", "accessibility": {"bypassHead": true}}', NULL, NULL),
  ('brightonandhoveindependent.co.uk', '{"family": "newsquest", "accessibility": {"bypassHead": true}}', NULL, NULL);