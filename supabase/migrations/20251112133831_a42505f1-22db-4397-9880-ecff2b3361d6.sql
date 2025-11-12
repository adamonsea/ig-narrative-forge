-- Update The Argus domain profile to prefer HTML scraping and skip Arc/RSS
UPDATE scraper_domain_profiles
SET profile = jsonb_set(
  COALESCE(profile, '{}'::jsonb),
  '{scrapingStrategy}',
  '{"preferred": "html", "skip": ["arc", "rss"], "timeout": 15000}'::jsonb
)
WHERE domain_key = 'theargus.co.uk';