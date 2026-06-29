UPDATE public.scraper_domain_profiles
SET profile = '{"family":"uk_local","accessibility":{"bypassHead":true,"timeout":8000},"scrapingStrategy":{"preferred":"rss","timeout":15000}}'::jsonb,
    updated_at = now()
WHERE domain_key = 'eastbournereporter.co.uk'
  AND topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';