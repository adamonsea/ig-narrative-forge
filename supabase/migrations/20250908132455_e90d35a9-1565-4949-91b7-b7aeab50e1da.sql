-- Phase 1: Create dedicated discarded articles tracking table
CREATE TABLE IF NOT EXISTS discarded_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  source_id UUID REFERENCES content_sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  title TEXT,
  discarded_reason TEXT NOT NULL,
  discarded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  discarded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure we can't discard the same URL twice for the same topic
  UNIQUE(topic_id, normalized_url)
);

-- Add indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_discarded_articles_topic_url ON discarded_articles(topic_id, normalized_url);
CREATE INDEX IF NOT EXISTS idx_discarded_articles_source_url ON discarded_articles(source_id, normalized_url);
CREATE INDEX IF NOT EXISTS idx_discarded_articles_url ON discarded_articles(normalized_url);
CREATE INDEX IF NOT EXISTS idx_discarded_articles_created_at ON discarded_articles(created_at);

-- Enable RLS
ALTER TABLE discarded_articles ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Topic owners can manage their discarded articles"
  ON discarded_articles
  FOR ALL
  USING (
    topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    ) 
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Add originality confidence score to articles
ALTER TABLE articles ADD COLUMN IF NOT EXISTS originality_confidence INTEGER DEFAULT 100;

-- Create function to normalize URLs consistently
CREATE OR REPLACE FUNCTION normalize_url_enhanced(input_url TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized_url TEXT;
BEGIN
  -- Return null if input is null or empty
  IF input_url IS NULL OR trim(input_url) = '' THEN
    RETURN NULL;
  END IF;
  
  -- Start with the input URL
  normalized_url := lower(trim(input_url));
  
  -- Remove protocol
  normalized_url := regexp_replace(normalized_url, '^https?://', '', 'i');
  
  -- Remove www prefix
  normalized_url := regexp_replace(normalized_url, '^www\.', '', 'i');
  
  -- Remove trailing slash
  normalized_url := regexp_replace(normalized_url, '/$', '');
  
  -- Remove common tracking parameters
  normalized_url := regexp_replace(normalized_url, '[?&](utm_[^&]*|fbclid=[^&]*|gclid=[^&]*|ref=[^&]*|source=[^&]*|_ga=[^&]*|_gid=[^&]*)', '', 'g');
  
  -- Clean up any remaining ? or & at the end
  normalized_url := regexp_replace(normalized_url, '[?&]$', '');
  
  -- Remove fragment identifiers
  normalized_url := regexp_replace(normalized_url, '#.*$', '');
  
  -- Remove common mobile/amp prefixes
  normalized_url := regexp_replace(normalized_url, '^(m\.|amp\.)', '');
  
  -- Remove port 80/443 (default ports)
  normalized_url := regexp_replace(normalized_url, ':80(/|$)', '\1');
  normalized_url := regexp_replace(normalized_url, ':443(/|$)', '\1');
  
  RETURN normalized_url;
END;
$$;

-- Log the creation
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Created discarded articles tracking system',
  jsonb_build_object(
    'table_created', 'discarded_articles',
    'indexes_created', 4,
    'rls_enabled', true,
    'originality_confidence_added', true
  ),
  'create_discarded_articles_system'
);