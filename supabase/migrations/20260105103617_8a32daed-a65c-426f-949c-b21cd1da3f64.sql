
-- Update scraping config to allow 60-day backfill
UPDATE content_sources 
SET scraping_config = jsonb_set(
  scraping_config, 
  '{trusted_max_age_days}', 
  '60'
),
updated_at = NOW()
WHERE id = '6c311d0d-0f3d-44af-8b43-7c06313fdff3';
