-- Lower regional relevance thresholds to allow more local content through
-- Update the validation function to be less restrictive

CREATE OR REPLACE FUNCTION public.validate_regional_relevance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  source_info RECORD;
  min_threshold INTEGER := 15; -- Lowered from 20
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
  
  -- Set different thresholds based on source type (all lowered)
  IF source_info.source_type = 'hyperlocal' THEN
    min_threshold := 10;  -- Lowered from 15
  ELSIF source_info.source_type = 'regional' THEN
    min_threshold := 20;  -- Lowered from 25
  ELSE
    min_threshold := 30;  -- Lowered from 40 for national sources
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