-- Fix get_topic_sources to use content_sources_basic and retrieve feed_url from source_config
CREATE OR REPLACE FUNCTION public.get_topic_sources(p_topic_id UUID)
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
    csb.id as source_id,
    csb.source_name,
    csb.canonical_domain,
    COALESCE(ts.source_config->>'feed_url', 'https://' || csb.canonical_domain) as feed_url,
    ts.is_active,
    csb.credibility_score,
    csb.articles_scraped,
    csb.last_scraped_at,
    ts.source_config
  FROM topic_sources ts
  JOIN content_sources_basic csb ON csb.id = ts.source_id
  WHERE ts.topic_id = p_topic_id
    AND ts.is_active = true
  ORDER BY csb.source_name;
END;
$$;

-- Populate feed_url in source_config for existing topic_sources where it's missing
UPDATE topic_sources ts
SET source_config = jsonb_set(
  COALESCE(ts.source_config, '{}'::jsonb),
  '{feed_url}',
  to_jsonb('https://' || csb.canonical_domain)
)
FROM content_sources_basic csb
WHERE ts.source_id = csb.id
  AND (ts.source_config IS NULL 
       OR ts.source_config->>'feed_url' IS NULL 
       OR ts.source_config->>'feed_url' = '')
  AND csb.canonical_domain IS NOT NULL;