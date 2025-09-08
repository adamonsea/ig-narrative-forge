-- Fix topic-scoped duplicate detection
CREATE OR REPLACE FUNCTION public.detect_article_duplicates(p_article_id uuid, p_topic_id uuid DEFAULT NULL)
 RETURNS TABLE(duplicate_id uuid, similarity_score numeric, detection_method text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  article_url text;
  article_title text;
  article_checksum text;
BEGIN
  -- Get the article details
  SELECT source_url, title, content_checksum, topic_id
  INTO article_url, article_title, article_checksum, p_topic_id
  FROM articles 
  WHERE id = p_article_id;
  
  IF article_url IS NULL THEN
    RETURN;
  END IF;
  
  -- Find exact URL duplicates within the same topic only
  RETURN QUERY
  SELECT 
    a.id as duplicate_id,
    1.0::NUMERIC as similarity_score,
    'exact_url'::TEXT as detection_method
  FROM articles a
  WHERE a.id != p_article_id
    AND a.processing_status NOT IN ('processed', 'published', 'merged', 'discarded')
    AND normalize_url(a.source_url) = normalize_url(article_url)
    AND (p_topic_id IS NULL OR a.topic_id = p_topic_id); -- Only check within same topic
  
  -- Find content checksum duplicates within the same topic only
  IF article_checksum IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      a.id as duplicate_id,
      1.0::NUMERIC as similarity_score,
      'content_checksum'::TEXT as detection_method
    FROM articles a
    WHERE a.id != p_article_id
      AND a.processing_status NOT IN ('processed', 'published', 'merged', 'discarded')
      AND a.content_checksum = article_checksum
      AND a.content_checksum IS NOT NULL
      AND (p_topic_id IS NULL OR a.topic_id = p_topic_id); -- Only check within same topic
  END IF;
  
  -- Find title duplicates within the same topic only (higher threshold 85%)
  IF article_title IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      a.id as duplicate_id,
      similarity(
        regexp_replace(lower(trim(a.title)), '[^\w\s]', '', 'g'),
        regexp_replace(lower(trim(article_title)), '[^\w\s]', '', 'g')
      )::NUMERIC as similarity_score,
      'title_similarity'::TEXT as detection_method
    FROM articles a
    WHERE a.id != p_article_id
      AND a.processing_status NOT IN ('processed', 'published', 'merged', 'discarded')
      AND a.title IS NOT NULL
      AND (p_topic_id IS NULL OR a.topic_id = p_topic_id) -- Only check within same topic
      AND similarity(
        regexp_replace(lower(trim(a.title)), '[^\w\s]', '', 'g'),
        regexp_replace(lower(trim(article_title)), '[^\w\s]', '', 'g')
      ) >= 0.85 -- Increased threshold
    ORDER BY similarity_score DESC;
  END IF;
END;
$function$;

-- Update the duplicate handling trigger to use topic-scoped detection
CREATE OR REPLACE FUNCTION public.handle_article_duplicates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  duplicate_count INTEGER;
  exact_duplicate_id UUID;
BEGIN
  -- Only check for duplicates on new articles
  IF NEW.processing_status = 'new' THEN
    
    -- First check for exact URL duplicates within the same topic
    SELECT id INTO exact_duplicate_id
    FROM articles
    WHERE id != NEW.id
      AND processing_status NOT IN ('discarded', 'merged')
      AND normalize_url(source_url) = normalize_url(NEW.source_url)
      AND (NEW.topic_id IS NULL OR topic_id = NEW.topic_id) -- Topic-scoped check
    LIMIT 1;
    
    -- If exact duplicate exists within the same topic, prevent insertion
    IF exact_duplicate_id IS NOT NULL THEN
      -- Update the existing article's timestamp to mark it as recently seen
      UPDATE articles 
      SET updated_at = now(),
          import_metadata = COALESCE(import_metadata, '{}')::jsonb || 
            jsonb_build_object(
              'duplicate_prevented', true,
              'original_duplicate_id', NEW.id,
              'prevented_at', now()
            )
      WHERE id = exact_duplicate_id;
      
      -- Log the prevention
      INSERT INTO system_logs (level, message, context, function_name)
      VALUES (
        'info',
        'Topic-scoped duplicate article insertion prevented',
        jsonb_build_object(
          'prevented_article_id', NEW.id,
          'existing_article_id', exact_duplicate_id,
          'topic_id', NEW.topic_id,
          'url', NEW.source_url,
          'title', NEW.title
        ),
        'handle_article_duplicates'
      );
      
      -- Prevent insertion by raising an exception that the scraper can handle
      RAISE EXCEPTION 'DUPLICATE_ARTICLE_PREVENTED: %', exact_duplicate_id;
    END IF;
    
    -- Check for other types of duplicates within the same topic for manual review
    SELECT COUNT(*) INTO duplicate_count
    FROM detect_article_duplicates(NEW.id, NEW.topic_id);
    
    -- If duplicates found within the same topic, mark for review
    IF duplicate_count > 0 THEN
      -- Insert into duplicate detection queue for manual review
      INSERT INTO article_duplicates_pending (
        original_article_id,
        duplicate_article_id,
        similarity_score,
        detection_method
      )
      SELECT 
        NEW.id,
        duplicate_id,
        similarity_score,
        detection_method
      FROM detect_article_duplicates(NEW.id, NEW.topic_id)
      ON CONFLICT DO NOTHING;
      
      -- Mark article for duplicate review
      NEW.processing_status := 'duplicate_pending';
      NEW.import_metadata := COALESCE(NEW.import_metadata, '{}')::jsonb || 
        jsonb_build_object(
          'duplicates_found', duplicate_count,
          'duplicate_check_completed', true,
          'topic_scoped', true,
          'checked_at', now()
        );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update the cleanup function to also be topic-scoped
CREATE OR REPLACE FUNCTION public.cleanup_existing_duplicates()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  processed_count INTEGER := 0;
  duplicate_count INTEGER := 0;
  article_record RECORD;
BEGIN
  -- Process articles in batches to find duplicates within their topics
  FOR article_record IN 
    SELECT id, topic_id FROM articles 
    WHERE processing_status NOT IN ('discarded', 'duplicate_pending')
    ORDER BY created_at DESC
    LIMIT 100
  LOOP
    -- Check for duplicates for this article within its topic
    SELECT COUNT(*) INTO duplicate_count
    FROM detect_article_duplicates(article_record.id, article_record.topic_id);
    
    IF duplicate_count > 0 THEN
      -- Insert duplicate records
      INSERT INTO article_duplicates_pending (
        original_article_id,
        duplicate_article_id,
        similarity_score,
        detection_method
      )
      SELECT 
        article_record.id,
        duplicate_id,
        similarity_score,
        detection_method
      FROM detect_article_duplicates(article_record.id, article_record.topic_id)
      ON CONFLICT DO NOTHING;
      
      processed_count := processed_count + 1;
    END IF;
  END LOOP;
  
  -- Log the topic-scoped cleanup
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Topic-scoped duplicate cleanup completed',
    jsonb_build_object(
      'articles_processed', processed_count,
      'scope', 'topic_scoped'
    ),
    'cleanup_existing_duplicates'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'articles_processed', processed_count,
    'duplicates_found', processed_count,
    'scope', 'topic_scoped'
  );
END;
$function$;