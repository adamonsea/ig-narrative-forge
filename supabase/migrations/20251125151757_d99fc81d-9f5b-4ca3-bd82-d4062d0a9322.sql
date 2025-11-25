-- Enable automation for Medical Device Development topic
INSERT INTO topic_automation_settings (topic_id, is_active, scrape_frequency_hours, automation_mode, quality_threshold)
VALUES ('3f05c5a3-3196-455d-bff4-e9a9a20b8615', true, 6, 'auto_gather', 30)
ON CONFLICT (topic_id) DO UPDATE SET
  is_active = true,
  scrape_frequency_hours = 6,
  automation_mode = 'auto_gather',
  updated_at = now();

-- Increase trusted_max_age_days to 7 for CEN and Analytical Scientist
UPDATE content_sources
SET scraping_config = jsonb_set(
  COALESCE(scraping_config, '{}'::jsonb),
  '{trusted_max_age_days}',
  '7'::jsonb
)
WHERE id IN (
  '095381d9-e8e9-4b67-b4b5-b77edc362a69',  -- CEN
  'bacc2e04-4427-4120-abd9-8010c5a43c32'   -- Analytical Scientist
);