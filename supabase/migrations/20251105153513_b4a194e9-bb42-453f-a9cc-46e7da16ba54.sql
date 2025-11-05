-- Create scraper_domain_profiles table for tenant-scoped domain configurations
CREATE TABLE IF NOT EXISTS scraper_domain_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  domain_key TEXT NOT NULL,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, domain_key),
  UNIQUE(topic_id, domain_key)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_scraper_domain_profiles_tenant ON scraper_domain_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scraper_domain_profiles_topic ON scraper_domain_profiles(topic_id);
CREATE INDEX IF NOT EXISTS idx_scraper_domain_profiles_domain ON scraper_domain_profiles(domain_key);

-- Enable RLS
ALTER TABLE scraper_domain_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own domain profiles
CREATE POLICY "Users can view their own domain profiles"
  ON scraper_domain_profiles
  FOR SELECT
  USING (
    auth.uid() = tenant_id 
    OR (topic_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM topics WHERE topics.id = scraper_domain_profiles.topic_id AND topics.created_by = auth.uid()
    ))
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Policy: Users can manage their own domain profiles
CREATE POLICY "Users can manage their own domain profiles"
  ON scraper_domain_profiles
  FOR ALL
  USING (
    auth.uid() = tenant_id 
    OR (topic_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM topics WHERE topics.id = scraper_domain_profiles.topic_id AND topics.created_by = auth.uid()
    ))
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Policy: Service role full access
CREATE POLICY "Service role can manage domain profiles"
  ON scraper_domain_profiles
  FOR ALL
  USING (auth.role() = 'service_role');

-- Seed initial Newsquest domain profiles (global, no tenant restriction)
INSERT INTO scraper_domain_profiles (tenant_id, domain_key, profile) VALUES
  (NULL, 'theargus.co.uk', '{
    "family": "newsquest",
    "arcSite": "thenational",
    "sectionFallbacks": ["/news/", "/local-news/", "/brighton/"],
    "accessibility": {"bypassHead": true},
    "warmup": {"enabled": true}
  }'::jsonb),
  (NULL, 'sussexexpress.co.uk', '{
    "family": "newsquest",
    "arcSite": "thenational",
    "sectionFallbacks": ["/news/", "/local-news/", "/eastbourne/"],
    "accessibility": {"bypassHead": true},
    "warmup": {"enabled": true}
  }'::jsonb),
  (NULL, 'theboltonnews.co.uk', '{
    "family": "newsquest",
    "arcSite": "thenational",
    "sectionFallbacks": ["/news/", "/local-news/", "/bolton/"],
    "accessibility": {"bypassHead": true},
    "warmup": {"enabled": true}
  }'::jsonb),
  (NULL, 'basingstokegazette.co.uk', '{
    "family": "newsquest",
    "arcSite": "thenational",
    "sectionFallbacks": ["/news/", "/local-news/", "/basingstoke/"],
    "accessibility": {"bypassHead": true},
    "warmup": {"enabled": true}
  }'::jsonb),
  (NULL, 'thenorthernecho.co.uk', '{
    "family": "newsquest",
    "arcSite": "thenational",
    "sectionFallbacks": ["/news/", "/local-news/"],
    "accessibility": {"bypassHead": true},
    "warmup": {"enabled": true}
  }'::jsonb),
  (NULL, 'lancashiretelegraph.co.uk', '{
    "family": "newsquest",
    "arcSite": "thenational",
    "sectionFallbacks": ["/news/", "/local-news/"],
    "accessibility": {"bypassHead": true},
    "warmup": {"enabled": true}
  }'::jsonb)
ON CONFLICT DO NOTHING;