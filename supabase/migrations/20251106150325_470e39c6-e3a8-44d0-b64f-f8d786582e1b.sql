-- Backfill confirmed_arc_section for Newsquest sources
-- This migration populates confirmed_arc_section from scraping_config->>'sectionPath'
-- for Newsquest domains where confirmed_arc_section is missing

UPDATE content_sources
SET 
  confirmed_arc_section = scraping_config->>'sectionPath',
  updated_at = now()
WHERE 
  canonical_domain IN ('theargus.co.uk', 'sussexexpress.co.uk', 'crawleyobserver.co.uk', 'brightonandhoveindependent.co.uk')
  AND (scraping_config->>'sectionPath') IS NOT NULL
  AND (confirmed_arc_section IS NULL OR confirmed_arc_section = '');

-- Deactivate orphaned RSS source that conflicts with Arc scraping
UPDATE content_sources
SET 
  is_active = false,
  updated_at = now()
WHERE 
  id = '00094692-8a2a-409c-be6a-3f18b9cf78a9' -- theargus.co.uk/news/rss/ orphan
  AND is_active = true;