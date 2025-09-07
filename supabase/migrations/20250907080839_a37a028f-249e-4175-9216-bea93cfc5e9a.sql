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
$function$;