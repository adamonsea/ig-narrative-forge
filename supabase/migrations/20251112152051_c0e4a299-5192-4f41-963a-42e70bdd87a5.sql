-- Add domain profiles for eastsussex.news and eastbourne.news with regional_slug family
INSERT INTO scraper_domain_profiles (domain_key, profile, tenant_id, topic_id)
VALUES 
  ('eastsussex.news', '{"family": "regional_slug", "accessibility": {"bypassHead": false}}', NULL, NULL),
  ('eastbourne.news', '{"family": "regional_slug", "accessibility": {"bypassHead": false}}', NULL, NULL);