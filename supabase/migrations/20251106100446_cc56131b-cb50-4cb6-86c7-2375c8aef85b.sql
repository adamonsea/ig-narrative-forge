-- Add confirmed Arc section path to content_sources for persistent scraping optimization
ALTER TABLE public.content_sources
ADD COLUMN IF NOT EXISTS confirmed_arc_section text;

COMMENT ON COLUMN public.content_sources.confirmed_arc_section IS 'Confirmed working Arc API section path for Newsquest sources, persisted after successful scrape';

-- Seed correct Newsquest Arc site slugs in domain profiles
-- First delete any existing entries to avoid duplicates
DELETE FROM public.scraper_domain_profiles 
WHERE domain_key IN ('sussexexpress.co.uk', 'eastbourneherald.co.uk', 'theargus.co.uk', 'gazette.co.uk')
  AND tenant_id IS NULL 
  AND topic_id IS NULL;

-- Insert fresh domain profiles
INSERT INTO public.scraper_domain_profiles (domain_key, profile, tenant_id, topic_id)
VALUES 
  ('sussexexpress.co.uk', '{"family": "newsquest", "arcSite": "sussexexpress", "sectionFallbacks": ["/news/local/", "/news/"], "accessibility": {"bypassHead": true}}'::jsonb, NULL, NULL),
  ('eastbourneherald.co.uk', '{"family": "newsquest", "arcSite": "eastbourneherald", "sectionFallbacks": ["/news/local/", "/news/"], "accessibility": {"bypassHead": true}}'::jsonb, NULL, NULL),
  ('theargus.co.uk', '{"family": "newsquest", "arcSite": "theargus", "sectionFallbacks": ["/news/brighton-hove/", "/news/"], "accessibility": {"bypassHead": true}}'::jsonb, NULL, NULL),
  ('gazette.co.uk', '{"family": "newsquest", "arcSite": "gazette", "sectionFallbacks": ["/news/local/", "/news/"], "accessibility": {"bypassHead": true}}'::jsonb, NULL, NULL);