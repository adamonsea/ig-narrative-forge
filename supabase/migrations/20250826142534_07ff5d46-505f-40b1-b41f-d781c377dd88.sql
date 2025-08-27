-- Fix function search path security warnings by adding SET search_path = 'public'

-- Fix validate_regional_relevance function
CREATE OR REPLACE FUNCTION public.validate_regional_relevance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  source_info RECORD;
  min_threshold INTEGER := 20;
BEGIN
  -- Get source information to determine thresholds
  SELECT source_type INTO source_info
  FROM content_sources 
  WHERE id = NEW.source_id;
  
  -- Calculate regional relevance score from import metadata
  IF NEW.import_metadata IS NOT NULL AND 
     (NEW.import_metadata->>'regional_relevance_score')::integer IS NOT NULL THEN
    NEW.regional_relevance_score := (NEW.import_metadata->>'regional_relevance_score')::integer;
  END IF;
  
  -- Set different thresholds based on source type
  IF source_info.source_type = 'hyperlocal' THEN
    min_threshold := 15;  -- Lower threshold for hyperlocal sources
  ELSIF source_info.source_type = 'regional' THEN
    min_threshold := 25;  -- Medium threshold for regional sources
  ELSE
    min_threshold := 40;  -- Higher threshold for national sources
  END IF;
  
  -- Reject articles with relevance below threshold
  IF NEW.regional_relevance_score < min_threshold AND NEW.processing_status = 'new' THEN
    -- Mark as discarded instead of inserting
    NEW.processing_status := 'discarded';
    -- Add rejection reason to metadata
    NEW.import_metadata := COALESCE(NEW.import_metadata, '{}')::jsonb || 
      jsonb_build_object(
        'rejection_reason', 'insufficient_regional_relevance', 
        'relevance_score', NEW.regional_relevance_score,
        'min_threshold', min_threshold,
        'source_type', source_info.source_type
      );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix approve_article_for_generation function  
CREATE OR REPLACE FUNCTION public.approve_article_for_generation(article_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Check if article exists and is not already in queue
  IF EXISTS (
    SELECT 1 FROM articles 
    WHERE id = article_uuid 
    AND processing_status IN ('new', 'processed')
  ) AND NOT EXISTS (
    SELECT 1 FROM content_generation_queue 
    WHERE article_id = article_uuid 
    AND status != 'completed'
  ) THEN
    
    -- Update article status to processed
    UPDATE articles 
    SET processing_status = 'processed',
        updated_at = NOW()
    WHERE id = article_uuid;
    
    -- Add to generation queue
    INSERT INTO content_generation_queue (
      article_id,
      slidetype,
      status,
      created_at
    ) VALUES (
      article_uuid,
      'tabloid',
      'pending',
      NOW()
    );
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$function$;

-- Fix auto_populate_content_queue function
CREATE OR REPLACE FUNCTION public.auto_populate_content_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Only add to queue if article is processed and has good quality scores
  IF NEW.processing_status = 'processed' AND 
     NEW.content_quality_score >= 50 AND 
     NEW.regional_relevance_score >= 5 THEN
    
    -- Check if there's already a pending or processing queue entry for this article
    IF NOT EXISTS (
      SELECT 1 FROM content_generation_queue 
      WHERE article_id = NEW.id 
      AND status IN ('pending', 'processing')
    ) THEN
      INSERT INTO content_generation_queue (
        article_id,
        slidetype,
        status,
        created_at
      ) VALUES (
        NEW.id,
        'tabloid',
        'pending',
        NOW()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Fix update_article_metadata function
CREATE OR REPLACE FUNCTION public.update_article_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
BEGIN
  -- Calculate word count
  NEW.word_count := CASE
    WHEN NEW.body IS NULL THEN 0
    ELSE COALESCE(array_length(regexp_split_to_array(trim(NEW.body), '\s+'), 1), 0)
  END;
  
  -- Calculate reading time (assuming 200 words per minute)
  NEW.reading_time_minutes := GREATEST(1, ROUND(NEW.word_count / 200.0));
  
  RETURN NEW;
END;
$function$;

-- Fix update_slide_word_count function
CREATE OR REPLACE FUNCTION public.update_slide_word_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
BEGIN
  NEW.word_count := CASE
    WHEN NEW.content IS NULL THEN 0
    ELSE COALESCE(array_length(regexp_split_to_array(trim(NEW.content), '\s+'), 1), 0)
  END;
  RETURN NEW;
END;
$function$;

-- Fix articles_search_tsv function
CREATE OR REPLACE FUNCTION public.articles_search_tsv()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $function$
BEGIN
  NEW.search :=
    setweight(to_tsvector('english', coalesce(NEW.title,'')),  'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body ,'')),  'B') ||
    setweight(to_tsvector('english', coalesce(NEW.author,'')), 'C');
  RETURN NEW;
END;
$function$;

-- Fix ensure_admin_role function
CREATE OR REPLACE FUNCTION public.ensure_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Check if this is the first user in the system
  IF NOT EXISTS (SELECT 1 FROM user_roles LIMIT 1) THEN
    -- Make the first user a superadmin
    INSERT INTO user_roles (user_id, role)
    VALUES (NEW.id, 'superadmin'::app_role)
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    -- Regular users get default user role
    INSERT INTO user_roles (user_id, role)
    VALUES (NEW.id, 'user'::app_role)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to assign user role: %', SQLERRM;
    RETURN NEW;
END;
$function$;