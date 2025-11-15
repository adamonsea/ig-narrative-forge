
-- Step 1: Fix BBC - Remove trust flags entirely (we don't want it as trusted)
UPDATE content_sources
SET scraping_config = scraping_config - 'trust_content_relevance' - 'trusted_max_age_days',
    region = 'Eastbourne'
WHERE canonical_domain = 'bbc.co.uk'
AND id = '7bc110f6-342c-4eb2-967e-6e63d79cb283';

-- Step 2: Set region for trusted sources that are missing it (for RLS)
UPDATE content_sources
SET region = 'Eastbourne'
WHERE id IN (
  '5c226b7e-300d-4cd6-b856-b391d3c36178',  -- bournefreelive.co.uk
  '1d43b1b9-8d9d-4c6d-a391-2d11c55d7e87'   -- eastbournereporter.co.uk
);

-- Step 3: Clean up duplicate eastsussex.news sources
-- Keep the one with region set (d2ba2822), deactivate others
UPDATE content_sources
SET is_active = false
WHERE canonical_domain = 'eastsussex.news'
AND id IN ('c2c27053-16c7-4e90-8869-40ba249508eb', '338ea35c-b695-435d-931b-d511b09ee5d0');

-- Deactivate their topic links
UPDATE topic_sources
SET is_active = false
WHERE source_id IN ('c2c27053-16c7-4e90-8869-40ba249508eb', '338ea35c-b695-435d-931b-d511b09ee5d0');

-- Step 4: Clean up duplicate sussex.press sources
-- Keep the one with region set (90d9711d), deactivate others
UPDATE content_sources
SET is_active = false
WHERE canonical_domain = 'sussex.press'
AND id IN ('45f4ea0a-1409-4624-9c35-b2b2fb58bca5', '2af2894b-b8b2-482d-94e8-06e1a206e4e9');

-- Deactivate their topic links
UPDATE topic_sources
SET is_active = false
WHERE source_id IN ('45f4ea0a-1409-4624-9c35-b2b2fb58bca5', '2af2894b-b8b2-482d-94e8-06e1a206e4e9');

-- Step 5: Clean up duplicate lewes-eastbourne.gov.uk sources
-- Keep the one with region set (719c4ab1), deactivate the other
UPDATE content_sources
SET is_active = false
WHERE canonical_domain = 'lewes-eastbourne.gov.uk'
AND id = '59c1474e-7f34-48c0-86f6-677a2e5bdc4b';

-- Deactivate its topic link
UPDATE topic_sources
SET is_active = false
WHERE source_id = '59c1474e-7f34-48c0-86f6-677a2e5bdc4b';

-- Step 6: Mark additional local sources as trusted with 1-day window
-- East Sussex news, Sussex press, Eastbourne Herald
UPDATE content_sources
SET scraping_config = jsonb_set(
  jsonb_set(
    COALESCE(scraping_config, '{}'::jsonb),
    '{trust_content_relevance}',
    'true'::jsonb
  ),
  '{trusted_max_age_days}',
  '1'::jsonb
),
region = 'Eastbourne'
WHERE id IN (
  'd2ba2822-3cd0-44e5-b879-54d8c03fc1ab',  -- eastsussex.news
  '90d9711d-849d-4d0a-a25d-d6bee0667f37',  -- sussex.press
  '67acca42-b988-4ad7-b5d5-236578eb8e80'   -- Eastbourne Herald
);

-- Activate their topic links
UPDATE topic_sources
SET is_active = true
WHERE source_id IN (
  'd2ba2822-3cd0-44e5-b879-54d8c03fc1ab',
  '90d9711d-849d-4d0a-a25d-d6bee0667f37',
  '67acca42-b988-4ad7-b5d5-236578eb8e80'
);

-- Log the normalization
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Normalized trusted source configuration for Eastbourne',
  jsonb_build_object(
    'bbc_untrusted', true,
    'duplicates_removed', 5,
    'new_trusted_sources', 3,
    'region_fixes', 2
  ),
  'normalize_trusted_sources'
);
