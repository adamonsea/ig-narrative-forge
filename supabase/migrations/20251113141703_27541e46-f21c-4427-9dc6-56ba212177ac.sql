-- Upsert custom domain profile for bioworld.com (global)
WITH updated AS (
  UPDATE public.scraper_domain_profiles
  SET profile = (
    '{
      "family": "custom",
      "scrapingStrategy": {
        "preferred": "html",
        "skip": ["rss"],
        "timeout": 20000
      },
      "categoryPatterns": ["/category/", "/news", "/topics/"],
      "articlePatterns": ["/article/", "/articles/", "/bioworld/"]
    }'
  )::jsonb
  WHERE domain_key = 'bioworld.com' AND tenant_id IS NULL AND topic_id IS NULL
  RETURNING domain_key
)
INSERT INTO public.scraper_domain_profiles (domain_key, profile)
SELECT 'bioworld.com', (
  '{
    "family": "custom",
    "scrapingStrategy": {
      "preferred": "html",
      "skip": ["rss"],
      "timeout": 20000
    },
    "categoryPatterns": ["/category/", "/news", "/topics/"],
    "articlePatterns": ["/article/", "/articles/", "/bioworld/"]
  }'
)::jsonb
WHERE NOT EXISTS (SELECT 1 FROM updated);

-- Clean up 360dx malformed source link and set the correct diagnostics URL on the existing 360dx source for this topic
WITH topic AS (
  SELECT id FROM public.topics WHERE slug = 'medical-device-development' LIMIT 1
)
DELETE FROM public.topic_sources ts
USING topic
WHERE ts.topic_id = topic.id
  AND ts.source_id = '70c0d419-eb49-4eb6-aa96-3b2048e68e8e';

UPDATE public.content_sources
SET is_active = false
WHERE id = '70c0d419-eb49-4eb6-aa96-3b2048e68e8e';

-- Update the currently linked 360dx.com source to use the diagnostics page
WITH topic AS (
  SELECT id FROM public.topics WHERE slug = 'medical-device-development' LIMIT 1
)
UPDATE public.content_sources cs
SET feed_url = 'https://www.360dx.com/diagnostics'
FROM topic
WHERE cs.source_name = '360dx.com' AND cs.topic_id = topic.id;