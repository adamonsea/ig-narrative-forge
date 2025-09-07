-- Phase 1: Create topic_sources junction table and helper functions
-- This allows many-to-many relationships between topics and sources

-- Create the topic_sources junction table
CREATE TABLE IF NOT EXISTS topic_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL,
  source_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Topic-specific source configuration
  source_config JSONB DEFAULT '{}'::jsonb,
  
  -- Unique constraint to prevent duplicate topic-source pairs
  UNIQUE(topic_id, source_id)
);

-- Add foreign key constraints
ALTER TABLE topic_sources 
ADD CONSTRAINT fk_topic_sources_topic_id 
FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE;

ALTER TABLE topic_sources 
ADD CONSTRAINT fk_topic_sources_source_id 
FOREIGN KEY (source_id) REFERENCES content_sources(id) ON DELETE CASCADE;

-- Add updated_at trigger
CREATE TRIGGER update_topic_sources_updated_at
  BEFORE UPDATE ON topic_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create index for performance
CREATE INDEX idx_topic_sources_topic_id ON topic_sources(topic_id);
CREATE INDEX idx_topic_sources_source_id ON topic_sources(source_id);
CREATE INDEX idx_topic_sources_active ON topic_sources(is_active) WHERE is_active = true;

-- Function to populate junction table from existing relationships
CREATE OR REPLACE FUNCTION populate_topic_sources_from_existing()
RETURNS INTEGER AS $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  -- Insert existing topic_id -> source relationships into junction table
  INSERT INTO topic_sources (topic_id, source_id, is_active, source_config)
  SELECT 
    cs.topic_id,
    cs.id as source_id,
    cs.is_active,
    jsonb_build_object(
      'migrated_from_content_sources', true,
      'migration_date', now()
    )
  FROM content_sources cs
  WHERE cs.topic_id IS NOT NULL
  ON CONFLICT (topic_id, source_id) DO NOTHING;
  
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  
  -- Log the migration
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Populated topic_sources junction table from existing relationships',
    jsonb_build_object(
      'inserted_count', inserted_count
    ),
    'populate_topic_sources_from_existing'
  );
  
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get sources for a topic using junction table
CREATE OR REPLACE FUNCTION get_topic_sources(p_topic_id UUID)
RETURNS TABLE(
  source_id UUID,
  source_name TEXT,
  canonical_domain TEXT,
  feed_url TEXT,
  is_active BOOLEAN,
  credibility_score INTEGER,
  articles_scraped INTEGER,
  last_scraped_at TIMESTAMP WITH TIME ZONE,
  source_config JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id as source_id,
    cs.source_name,
    cs.canonical_domain,
    cs.feed_url,
    ts.is_active,
    cs.credibility_score,
    cs.articles_scraped,
    cs.last_scraped_at,
    ts.source_config
  FROM topic_sources ts
  JOIN content_sources cs ON cs.id = ts.source_id
  WHERE ts.topic_id = p_topic_id
    AND ts.is_active = true
  ORDER BY cs.source_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add a source to a topic (with source_config support)
CREATE OR REPLACE FUNCTION add_source_to_topic(
  p_topic_id UUID,
  p_source_id UUID,
  p_source_config JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO topic_sources (topic_id, source_id, source_config)
  VALUES (p_topic_id, p_source_id, p_source_config)
  ON CONFLICT (topic_id, source_id) 
  DO UPDATE SET 
    is_active = true,
    source_config = EXCLUDED.source_config,
    updated_at = now();
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove a source from a topic
CREATE OR REPLACE FUNCTION remove_source_from_topic(
  p_topic_id UUID,
  p_source_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE topic_sources 
  SET is_active = false, updated_at = now()
  WHERE topic_id = p_topic_id AND source_id = p_source_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get topics for a source (reverse lookup)
CREATE OR REPLACE FUNCTION get_source_topics(p_source_id UUID)
RETURNS TABLE(
  topic_id UUID,
  topic_name TEXT,
  topic_type TEXT,
  region TEXT,
  is_active BOOLEAN,
  source_config JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as topic_id,
    t.name as topic_name,
    t.topic_type,
    t.region,
    ts.is_active,
    ts.source_config
  FROM topic_sources ts
  JOIN topics t ON t.id = ts.topic_id
  WHERE ts.source_id = p_source_id
    AND ts.is_active = true
  ORDER BY t.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS policies for topic_sources table
ALTER TABLE topic_sources ENABLE ROW LEVEL SECURITY;

-- Topic owners can manage their topic-source relationships
CREATE POLICY "Topic owners can manage their topic sources" 
ON topic_sources 
FOR ALL 
USING (
  auth.uid() IS NOT NULL 
  AND (
    topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (
    topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Service role has full access
CREATE POLICY "Service role can manage topic sources"
ON topic_sources 
FOR ALL 
USING (auth.role() = 'service_role'::text);

-- Public can read active topic-source relationships for public topics
CREATE POLICY "Public can view active topic sources for public topics"
ON topic_sources 
FOR SELECT 
USING (
  is_active = true 
  AND topic_id IN (
    SELECT id FROM topics WHERE is_public = true AND is_active = true
  )
);