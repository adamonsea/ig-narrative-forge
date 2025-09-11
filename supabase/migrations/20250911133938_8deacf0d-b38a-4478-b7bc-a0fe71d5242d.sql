-- Add function to get topic articles for multi-tenant structure
CREATE OR REPLACE FUNCTION get_topic_articles_multi_tenant(
  p_topic_id UUID,
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  shared_content_id UUID,
  topic_id UUID,
  source_id UUID,
  regional_relevance_score INT,
  content_quality_score INT,
  import_metadata JSONB,
  originality_confidence INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  processing_status TEXT,
  keyword_matches TEXT[],
  -- Shared content fields
  url TEXT,
  normalized_url TEXT,
  title TEXT,
  body TEXT,
  author TEXT,
  image_url TEXT,
  canonical_url TEXT,
  content_checksum TEXT,
  published_at TIMESTAMPTZ,
  word_count INT,
  language TEXT,
  source_domain TEXT,
  last_seen_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ta.id,
    ta.shared_content_id,
    ta.topic_id,
    ta.source_id,
    ta.regional_relevance_score,
    ta.content_quality_score,
    ta.import_metadata,
    ta.originality_confidence,
    ta.created_at,
    ta.updated_at,
    ta.processing_status,
    ta.keyword_matches,
    -- Shared content fields
    sac.url,
    sac.normalized_url,
    sac.title,
    sac.body,
    sac.author,
    sac.image_url,
    sac.canonical_url,
    sac.content_checksum,
    sac.published_at,
    sac.word_count,
    sac.language,
    sac.source_domain,
    sac.last_seen_at
  FROM topic_articles ta
  JOIN shared_article_content sac ON ta.shared_content_id = sac.id
  WHERE ta.topic_id = p_topic_id
    AND ta.processing_status != 'discarded'  -- Exclude discarded articles
    AND (p_status IS NULL OR ta.processing_status = p_status)
  ORDER BY ta.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;