-- Fix remaining function search path security warnings

-- Fix reset_stalled_processing function
CREATE OR REPLACE FUNCTION public.reset_stalled_processing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Reset stories stuck in processing for more than 10 minutes
  UPDATE stories 
  SET status = 'draft', 
      updated_at = now()
  WHERE status = 'processing' 
    AND updated_at < now() - interval '10 minutes';
    
  -- Log the reset action
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info', 
    'Reset stalled processing jobs', 
    jsonb_build_object('reset_count', (SELECT count(*) FROM stories WHERE status = 'processing' AND updated_at < now() - interval '10 minutes')),
    'reset_stalled_processing'
  );
END;
$function$;

-- Fix reset_stalled_stories function
CREATE OR REPLACE FUNCTION public.reset_stalled_stories()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  reset_count integer;
BEGIN
  -- Reset stories stuck in processing for more than 5 minutes
  UPDATE stories 
  SET status = 'draft', 
      updated_at = now()
  WHERE status = 'processing' 
    AND updated_at < now() - interval '5 minutes';
    
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  
  -- Log the reset action if any stories were reset
  IF reset_count > 0 THEN
    INSERT INTO system_logs (level, message, context, function_name)
    VALUES (
      'info', 
      'Auto-reset stalled processing stories', 
      jsonb_build_object('reset_count', reset_count),
      'reset_stalled_stories'
    );
  END IF;
  
  RETURN reset_count;
END;
$function$;

-- Fix find_duplicate_articles function
CREATE OR REPLACE FUNCTION public.find_duplicate_articles(p_article_id uuid, p_similarity_threshold numeric DEFAULT 0.8)
RETURNS TABLE(duplicate_id uuid, similarity_score numeric, detection_method text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Find duplicates based on content checksum
  RETURN QUERY
  SELECT 
    a.id as duplicate_id,
    1.0::NUMERIC as similarity_score,
    'checksum'::TEXT as detection_method
  FROM articles a
  WHERE a.id != p_article_id
    AND a.content_checksum = (
      SELECT content_checksum 
      FROM articles 
      WHERE id = p_article_id
    )
    AND a.content_checksum IS NOT NULL;
  
  -- Find duplicates based on similar titles (using similarity)
  RETURN QUERY
  SELECT 
    a.id as duplicate_id,
    similarity(a.title, ref.title)::NUMERIC as similarity_score,
    'title'::TEXT as detection_method
  FROM articles a
  CROSS JOIN (
    SELECT title FROM articles WHERE id = p_article_id
  ) ref
  WHERE a.id != p_article_id
    AND similarity(a.title, ref.title) >= p_similarity_threshold;
END;
$function$;

-- Fix detect_article_duplicates function
CREATE OR REPLACE FUNCTION public.detect_article_duplicates(p_article_id uuid)
RETURNS TABLE(duplicate_id uuid, similarity_score numeric, detection_method text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Find duplicates based on title similarity using pg_trgm
  RETURN QUERY
  SELECT 
    a.id as duplicate_id,
    similarity(a.title, ref.title)::NUMERIC as similarity_score,
    'title_similarity'::TEXT as detection_method
  FROM articles a
  CROSS JOIN (
    SELECT title FROM articles WHERE id = p_article_id
  ) ref
  WHERE a.id != p_article_id
    AND a.processing_status = 'new' -- Only check against unprocessed articles
    AND similarity(a.title, ref.title) >= 0.7
  ORDER BY similarity_score DESC;
END;
$function$;

-- Fix test_search_functionality function
CREATE OR REPLACE FUNCTION public.test_search_functionality(p_search_term text DEFAULT 'sample'::text)
RETURNS TABLE(article_id uuid, title text, relevance_score real)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.title,
    ts_rank(a.search, plainto_tsquery('english', p_search_term)) as relevance_score
  FROM articles a
  WHERE a.search @@ plainto_tsquery('english', p_search_term)
  ORDER BY relevance_score DESC
  LIMIT 10;
END;
$function$;

-- Fix test_rss_import function
CREATE OR REPLACE FUNCTION public.test_rss_import(p_source_name text DEFAULT 'Test RSS Source'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  source_record RECORD;
  result JSONB;
BEGIN
  -- Create or get test source
  INSERT INTO content_sources (
    source_name,
    feed_url,
    credibility_score,
    region,
    content_type,
    canonical_domain,
    is_active
  ) VALUES (
    p_source_name,
    'https://feeds.bbci.co.uk/news/rss.xml',
    85,
    'Test',
    'news',
    'test.com',
    true
  )
  ON CONFLICT (source_name) DO UPDATE SET
    feed_url = EXCLUDED.feed_url,
    updated_at = now()
  RETURNING * INTO source_record;
  
  -- Return test source info
  result := jsonb_build_object(
    'success', true,
    'source_id', source_record.id,
    'source_name', source_record.source_name,
    'feed_url', source_record.feed_url,
    'message', 'Test source created successfully'
  );
  
  RETURN result;
END;
$function$;

-- Fix log_event function
CREATE OR REPLACE FUNCTION public.log_event(p_level text, p_message text, p_context jsonb DEFAULT '{}'::jsonb, p_function_name text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  log_id uuid;
BEGIN
  INSERT INTO system_logs (level, message, context, function_name, user_id)
  VALUES (p_level, p_message, p_context, p_function_name, auth.uid())
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$function$;