-- Drop and recreate the RPC function with correct return type
DROP FUNCTION IF EXISTS public.get_article_content_unified(uuid, uuid, uuid);

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

-- Clean up stuck jobs and return articles to pipeline
DO $$
DECLARE
    stuck_job RECORD;
BEGIN
    -- Process each failed job individually
    FOR stuck_job IN 
        SELECT id, article_id, topic_article_id FROM content_generation_queue 
        WHERE status = 'failed' AND attempts >= 3
    LOOP
        -- Delete the failed job from queue
        DELETE FROM content_generation_queue WHERE id = stuck_job.id;
        
        -- Reset article status based on type
        IF stuck_job.article_id IS NOT NULL THEN
            -- Legacy article - reset to new
            UPDATE articles 
            SET processing_status = 'new', updated_at = now()
            WHERE id = stuck_job.article_id;
        ELSIF stuck_job.topic_article_id IS NOT NULL THEN
            -- Multi-tenant article - reset to new
            UPDATE topic_articles 
            SET processing_status = 'new', updated_at = now()
            WHERE id = stuck_job.topic_article_id;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Cleaned up stuck queue jobs and returned articles to pipeline';
END $$;