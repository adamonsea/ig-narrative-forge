-- Clean up stuck queue jobs first
UPDATE content_generation_queue 
SET status = 'failed', 
    error_message = 'Cleaning up stuck jobs - returning to pipeline'
WHERE status = 'pending' AND attempts >= 3;

-- Create the missing RPC function that content-generator expects
CREATE OR REPLACE FUNCTION public.get_article_content_unified(
  p_article_id uuid DEFAULT NULL,
  p_topic_article_id uuid DEFAULT NULL, 
  p_shared_content_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  title text,
  body text,
  author text,
  source_url text,
  image_url text,
  canonical_url text,
  published_at timestamp with time zone,
  word_count integer,
  regional_relevance_score integer,
  content_quality_score integer,
  processing_status text,
  source_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Try legacy article first
  IF p_article_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      a.id,
      a.title,
      a.body,
      a.author,
      a.source_url,
      a.image_url,
      a.canonical_url,
      a.published_at,
      a.word_count,
      a.regional_relevance_score,
      a.content_quality_score,
      a.processing_status,
      'legacy'::text as source_type
    FROM articles a
    WHERE a.id = p_article_id;
    
    -- Return if found
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;
  
  -- Try multi-tenant article via topic_articles
  IF p_topic_article_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      ta.id,
      sac.title,
      sac.body,
      sac.author,
      sac.url as source_url,
      sac.image_url,
      sac.canonical_url,
      sac.published_at,
      sac.word_count,
      ta.regional_relevance_score,
      ta.content_quality_score,
      ta.processing_status,
      'multi_tenant'::text as source_type
    FROM topic_articles ta
    JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    WHERE ta.id = p_topic_article_id;
    
    -- Return if found
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;
  
  -- Try direct shared content lookup
  IF p_shared_content_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      sac.id,
      sac.title,
      sac.body,
      sac.author,
      sac.url as source_url,
      sac.image_url,
      sac.canonical_url,
      sac.published_at,
      sac.word_count,
      0 as regional_relevance_score,
      0 as content_quality_score,
      'new'::text as processing_status,
      'shared_content'::text as source_type
    FROM shared_article_content sac
    WHERE sac.id = p_shared_content_id;
  END IF;
END;
$function$;