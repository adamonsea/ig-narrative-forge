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
$function$;