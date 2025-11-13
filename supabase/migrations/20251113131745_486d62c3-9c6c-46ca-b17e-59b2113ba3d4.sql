-- Add domain profile for 360dx.com to detect category pages and prefer RSS scraping
DELETE FROM scraper_domain_profiles 
WHERE domain_key = '360dx.com' 
AND topic_id = '3f05c5a3-3196-455d-bff4-e9a9a20b8615';

INSERT INTO scraper_domain_profiles (domain_key, profile, tenant_id, topic_id)
VALUES (
  '360dx.com',
  '{
    "family": "custom",
    "scrapingStrategy": {
      "preferred": "rss",
      "skip": []
    },
    "categoryPatterns": [
      "^\\/[a-z-]+$",
      "^\\/business-news$",
      "^\\/research-funding$",
      "^\\/policy-legislation$",
      "^\\/diagnostics$",
      "^\\/sequencing$",
      "^\\/pcr$",
      "^\\/liquid-biopsy$"
    ],
    "articlePatterns": [
      "^\\/[a-z-]+\\/[0-9]+"
    ]
  }'::jsonb,
  NULL,
  '3f05c5a3-3196-455d-bff4-e9a9a20b8615'
);