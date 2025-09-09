-- Add RPC function to get multi-tenant articles with proper filtering
CREATE OR REPLACE FUNCTION get_topic_articles_multi_tenant(
  p_topic_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid,
  shared_content_id uuid,
  title text,
  body text,
  author text,
  url text,
  published_at timestamp with time zone,
  created_at timestamp with time zone,
  processing_status text,
  content_quality_score integer,
  regional_relevance_score integer,
  keyword_matches text[],
  word_count integer,
  source_domain text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ta.id,
    ta.shared_content_id,
    sac.title,
    sac.body,
    sac.author,
    sac.url,
    sac.published_at,
    ta.created_at,
    ta.processing_status,
    ta.content_quality_score,
    ta.regional_relevance_score,
    ta.keyword_matches,
    sac.word_count,
    sac.source_domain
  FROM topic_articles ta
  JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  WHERE ta.topic_id = p_topic_id
    AND ta.processing_status != 'discarded'  -- Filter out discarded articles
  ORDER BY ta.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;