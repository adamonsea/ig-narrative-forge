-- Fix security warnings for the functions created in Phase 1
-- Add SET search_path = public to all functions

-- Fix populate_topic_sources_from_existing function
CREATE OR REPLACE FUNCTION populate_topic_sources_from_existing()
RETURNS INTEGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Fix get_topic_sources function
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
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Fix add_source_to_topic function
CREATE OR REPLACE FUNCTION add_source_to_topic(
  p_topic_id UUID,
  p_source_id UUID,
  p_source_config JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Fix remove_source_from_topic function
CREATE OR REPLACE FUNCTION remove_source_from_topic(
  p_topic_id UUID,
  p_source_id UUID
)
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE topic_sources 
  SET is_active = false, updated_at = now()
  WHERE topic_id = p_topic_id AND source_id = p_source_id;
  
  RETURN FOUND;
END;
$$;

-- Fix get_source_topics function
CREATE OR REPLACE FUNCTION get_source_topics(p_source_id UUID)
RETURNS TABLE(
  topic_id UUID,
  topic_name TEXT,
  topic_type TEXT,
  region TEXT,
  is_active BOOLEAN,
  source_config JSONB
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;