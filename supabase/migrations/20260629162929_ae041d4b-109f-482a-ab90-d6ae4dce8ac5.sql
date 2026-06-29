UPDATE public.content_sources
SET scraping_config = jsonb_set(coalesce(scraping_config,'{}'::jsonb), '{trusted_max_age_days}', '30'::jsonb),
    updated_at = now()
WHERE id = '1d43b1b9-8d9d-4c6d-a391-2d11c55d7e87';