
-- Reset trusted_max_age_days to 14 days for ongoing scraping
UPDATE content_sources 
SET scraping_config = jsonb_set(
  scraping_config, 
  '{trusted_max_age_days}', 
  '14'
),
updated_at = NOW()
WHERE id = '6c311d0d-0f3d-44af-8b43-7c06313fdff3';

-- Deactivate the duplicate old Chamber source
UPDATE content_sources 
SET is_active = false,
    updated_at = NOW()
WHERE id = '89e3ab52-2e57-435a-b4f9-f83a4b20e3af';
