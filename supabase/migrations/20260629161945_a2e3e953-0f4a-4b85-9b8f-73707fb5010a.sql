UPDATE public.content_sources
SET feed_url = 'https://www.eastbournereporter.co.uk/rss/', updated_at = now()
WHERE id = '1d43b1b9-8d9d-4c6d-a391-2d11c55d7e87';

INSERT INTO public.scraper_domain_profiles (id, topic_id, domain_key, profile, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'd224e606-1a4c-4713-8135-1d30e2d6d0c6',
  'eastbournereporter.co.uk',
  '{"family":"uk_local","scrapingStrategy":{"preferred":"rss","timeout":15000},"accessibility":{"bypassHead":true,"timeout":8000}}'::jsonb,
  now(),
  now()
)
ON CONFLICT DO NOTHING;