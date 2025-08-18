-- Phase 0: Fix Critical Security Issues & Add Infrastructure

-- =====================================================
-- SECURITY FIXES: Restrict all tables to authenticated users only
-- =====================================================

-- Drop existing public read policies
DROP POLICY IF EXISTS "Articles are viewable by everyone" ON articles;
DROP POLICY IF EXISTS "Stories are viewable by everyone" ON stories;  
DROP POLICY IF EXISTS "Slides are viewable by everyone" ON slides;
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON posts;
DROP POLICY IF EXISTS "Visuals are viewable by everyone" ON visuals;

-- Create restrictive authenticated-only policies
CREATE POLICY "Articles viewable by authenticated users" 
  ON articles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Stories viewable by authenticated users" 
  ON stories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Slides viewable by authenticated users" 
  ON slides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Posts viewable by authenticated users" 
  ON posts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Visuals viewable by authenticated users" 
  ON visuals FOR SELECT TO authenticated USING (true);

-- Add missing UPDATE/DELETE policies with ownership controls
CREATE POLICY "Articles update by authenticated" 
  ON articles FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Articles delete by authenticated" 
  ON articles FOR DELETE TO authenticated USING (true);

CREATE POLICY "Slides update by authenticated" 
  ON slides FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Slides delete by authenticated" 
  ON slides FOR DELETE TO authenticated USING (true);

CREATE POLICY "Visuals update by authenticated" 
  ON visuals FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Visuals delete by authenticated" 
  ON visuals FOR DELETE TO authenticated USING (true);

CREATE POLICY "Posts delete by authenticated" 
  ON posts FOR DELETE TO authenticated USING (true);

CREATE POLICY "Stories delete by authenticated" 
  ON stories FOR DELETE TO authenticated USING (true);

-- =====================================================
-- INFRASTRUCTURE TABLES
-- =====================================================

-- Job system for background processing
CREATE TABLE IF NOT EXISTS job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL, -- 'scraper', 'ai_summarize', 'visual_gen', 'publish'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  input_data jsonb,
  output_data jsonb,
  error_message text,
  idempotency_key text UNIQUE,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  scheduled_at timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_job_runs_status ON job_runs(status);
CREATE INDEX idx_job_runs_type_status ON job_runs(job_type, status);
CREATE INDEX idx_job_runs_scheduled ON job_runs(scheduled_at) WHERE status = 'pending';

-- Feature flags system
CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name text UNIQUE NOT NULL,
  enabled boolean DEFAULT false,
  description text,
  config jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Insert default feature flags
INSERT INTO feature_flags (flag_name, enabled, description) VALUES
  ('visual_generation', true, 'Enable AI visual generation'),
  ('sponsor_slots', false, 'Enable sponsored content slots'),
  ('instagram_publishing', true, 'Enable Instagram post publishing'),
  ('tiktok_publishing', false, 'Enable TikTok post publishing'),
  ('linkedin_publishing', true, 'Enable LinkedIn post publishing'),
  ('x_publishing', true, 'Enable X (Twitter) post publishing'),
  ('ai_content_filter', true, 'Enable AI content filtering for compliance');

-- Content source metadata and provenance
CREATE TABLE IF NOT EXISTS content_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text UNIQUE NOT NULL,
  canonical_domain text,
  credibility_score integer DEFAULT 50, -- 0-100 scale
  is_active boolean DEFAULT true,
  scraping_config jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Add provenance tracking to articles
ALTER TABLE articles 
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS content_checksum text,
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES content_sources(id),
  ADD COLUMN IF NOT EXISTS copyright_flags jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS import_metadata jsonb DEFAULT '{}';

-- Deduplication index
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_dedup ON articles(content_checksum) WHERE content_checksum IS NOT NULL;

-- System monitoring and observability
CREATE TABLE IF NOT EXISTS system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid,
  level text NOT NULL, -- 'info', 'warn', 'error', 'debug'
  message text NOT NULL,
  context jsonb DEFAULT '{}',
  function_name text,
  user_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_system_logs_level ON system_logs(level);
CREATE INDEX idx_system_logs_created ON system_logs(created_at);
CREATE INDEX idx_system_logs_function ON system_logs(function_name);

-- Cost tracking and rate limiting
CREATE TABLE IF NOT EXISTS api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL, -- 'openai', 'anthropic', 'huggingface'
  operation text NOT NULL, -- 'chat_completion', 'image_generation'
  tokens_used integer DEFAULT 0,
  cost_usd decimal(10,6) DEFAULT 0,
  region text,
  job_run_id uuid REFERENCES job_runs(id),
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_api_usage_service_date ON api_usage(service_name, created_at);
CREATE INDEX idx_api_usage_region_date ON api_usage(region, created_at);

-- =====================================================
-- STORAGE SETUP
-- =====================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('visuals', 'visuals', true),
  ('templates', 'templates', true),
  ('exports', 'exports', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for visuals bucket
CREATE POLICY "Visuals bucket read access" 
  ON storage.objects FOR SELECT 
  USING (bucket_id = 'visuals');

CREATE POLICY "Visuals bucket write access" 
  ON storage.objects FOR INSERT 
  WITH CHECK (bucket_id = 'visuals' AND auth.role() = 'authenticated');

-- Storage policies for templates bucket  
CREATE POLICY "Templates bucket read access" 
  ON storage.objects FOR SELECT 
  USING (bucket_id = 'templates');

CREATE POLICY "Templates bucket write access" 
  ON storage.objects FOR INSERT 
  WITH CHECK (bucket_id = 'templates' AND auth.role() = 'authenticated');

-- Storage policies for exports bucket (private)
CREATE POLICY "Exports bucket authenticated access" 
  ON storage.objects FOR SELECT 
  TO authenticated USING (bucket_id = 'exports');

CREATE POLICY "Exports bucket authenticated write" 
  ON storage.objects FOR INSERT 
  TO authenticated WITH CHECK (bucket_id = 'exports');

-- =====================================================
-- ENABLE RLS ON NEW TABLES
-- =====================================================

ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY; 
ALTER TABLE content_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies for infrastructure tables
CREATE POLICY "Job runs authenticated access" 
  ON job_runs FOR ALL TO authenticated USING (true);

CREATE POLICY "Feature flags read by authenticated" 
  ON feature_flags FOR SELECT TO authenticated USING (true);

CREATE POLICY "Feature flags admin only" 
  ON feature_flags FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "Content sources authenticated access" 
  ON content_sources FOR ALL TO authenticated USING (true);

CREATE POLICY "System logs service role only" 
  ON system_logs FOR ALL TO service_role USING (true);

CREATE POLICY "API usage authenticated read" 
  ON api_usage FOR SELECT TO authenticated USING (true);

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE TRIGGER update_job_runs_updated_at
  BEFORE UPDATE ON job_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags  
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_sources_updated_at
  BEFORE UPDATE ON content_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- UTILITY FUNCTIONS WITH PROPER SECURITY
-- =====================================================

-- Function to check feature flags
CREATE OR REPLACE FUNCTION public.is_feature_enabled(flag_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT enabled FROM feature_flags WHERE feature_flags.flag_name = $1 LIMIT 1;
$$;

-- Function for logging with proper security
CREATE OR REPLACE FUNCTION public.log_event(
  p_level text,
  p_message text,
  p_context jsonb DEFAULT '{}',
  p_function_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id uuid;
BEGIN
  INSERT INTO system_logs (level, message, context, function_name, user_id)
  VALUES (p_level, p_message, p_context, p_function_name, auth.uid())
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;