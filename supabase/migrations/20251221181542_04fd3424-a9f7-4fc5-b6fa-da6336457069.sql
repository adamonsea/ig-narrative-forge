-- Reduce payload size for dashboard/article lists by not returning full article bodies
-- Keeps same signature for compatibility with existing typed Supabase RPC calls.

CREATE OR REPLACE FUNCTION public.get_topic_articles_multi_tenant(
  p_topic_id uuid,
  p_status text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  shared_content_id uuid,
  topic_id uuid,
  source_id uuid,
  regional_relevance_score integer,
  content_quality_score integer,
  import_metadata jsonb,
  originality_confidence integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  processing_status text,
  keyword_matches text[],
  url text,
  normalized_url text,
  title text,
  body text,
  author text,
  image_url text,
  canonical_url text,
  content_checksum text,
  published_at timestamp with time zone,
  word_count integer,
  language text,
  source_domain text,
  last_seen_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    sac.url,
    sac.normalized_url,
    sac.title,
    NULL::text AS body, -- avoid sending large article body blobs in list payloads
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
    AND ta.processing_status != 'discarded'
    AND (p_status IS NULL OR ta.processing_status = p_status)
  ORDER BY ta.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;