-- Improve duplicate detection function with lower threshold and better logic
CREATE OR REPLACE FUNCTION public.detect_article_duplicates(p_article_id uuid)
 RETURNS TABLE(duplicate_id uuid, similarity_score numeric, detection_method text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Find duplicates based on exact URL match (highest priority)
  RETURN QUERY
  SELECT 
    a.id as duplicate_id,
    1.0::NUMERIC as similarity_score,
    'exact_url'::TEXT as detection_method
  FROM articles a
  WHERE a.id != p_article_id
    AND a.processing_status != 'discarded'
    AND a.source_url = (
      SELECT source_url 
      FROM articles 
      WHERE id = p_article_id
    );
  
  -- Find duplicates based on title similarity with improved normalization
  RETURN QUERY
  SELECT 
    a.id as duplicate_id,
    similarity(
      regexp_replace(lower(trim(a.title)), '[^\w\s]', '', 'g'),
      regexp_replace(lower(trim(ref.title)), '[^\w\s]', '', 'g')
    )::NUMERIC as similarity_score,
    'title_similarity'::TEXT as detection_method
  FROM articles a
  CROSS JOIN (
    SELECT title FROM articles WHERE id = p_article_id
  ) ref
  WHERE a.id != p_article_id
    AND a.processing_status != 'discarded'
    AND similarity(
      regexp_replace(lower(trim(a.title)), '[^\w\s]', '', 'g'),
      regexp_replace(lower(trim(ref.title)), '[^\w\s]', '', 'g')
    ) >= 0.6
  ORDER BY similarity_score DESC;
END;
$function$

-- Create function for automatic duplicate handling during article import
CREATE OR REPLACE FUNCTION public.handle_article_duplicates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  duplicate_count INTEGER;
BEGIN
  -- Only check for duplicates on new articles
  IF NEW.processing_status = 'new' THEN
    -- Check for duplicates
    SELECT COUNT(*) INTO duplicate_count
    FROM detect_article_duplicates(NEW.id);
    
    -- If duplicates found, trigger duplicate detection
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
      FROM detect_article_duplicates(NEW.id);
      
      -- Mark article for duplicate review
      NEW.processing_status := 'duplicate_pending';
      NEW.import_metadata := COALESCE(NEW.import_metadata, '{}')::jsonb || 
        jsonb_build_object(
          'duplicates_found', duplicate_count,
          'duplicate_check_completed', true,
          'checked_at', now()
        );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$

-- Create cleanup function for existing duplicates
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
  -- Process articles in batches to find duplicates
  FOR article_record IN 
    SELECT id FROM articles 
    WHERE processing_status NOT IN ('discarded', 'duplicate_pending')
    ORDER BY created_at DESC
    LIMIT 100
  LOOP
    -- Check for duplicates for this article
    SELECT COUNT(*) INTO duplicate_count
    FROM detect_article_duplicates(article_record.id);
    
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
      FROM detect_article_duplicates(article_record.id)
      ON CONFLICT DO NOTHING;
      
      processed_count := processed_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'articles_processed', processed_count,
    'duplicates_found', processed_count
  );
END;
$function$

-- Add trigger to automatically detect duplicates on article insert
DROP TRIGGER IF EXISTS auto_duplicate_detection ON articles;
CREATE TRIGGER auto_duplicate_detection
  BEFORE INSERT ON articles
  FOR EACH ROW
  EXECUTE FUNCTION handle_article_duplicates();