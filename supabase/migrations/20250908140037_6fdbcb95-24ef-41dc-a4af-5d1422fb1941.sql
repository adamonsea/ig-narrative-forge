-- Update validate_regional_relevance function to respect credibility scores
CREATE OR REPLACE FUNCTION public.validate_regional_relevance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  source_info RECORD;
  min_threshold INTEGER := 0;
BEGIN
  -- Get source information including credibility score
  SELECT source_type, credibility_score INTO source_info
  FROM content_sources 
  WHERE id = NEW.source_id;
  
  -- Calculate regional relevance score from import metadata
  IF NEW.import_metadata IS NOT NULL AND 
     (NEW.import_metadata->>'regional_relevance_score')::integer IS NOT NULL THEN
    NEW.regional_relevance_score := (NEW.import_metadata->>'regional_relevance_score')::integer;
  END IF;
  
  -- Set credibility-based thresholds (MVP bypass system)
  IF source_info.credibility_score >= 90 THEN
    min_threshold := -1000;  -- Complete bypass for highest credibility sources
  ELSIF source_info.credibility_score >= 80 THEN
    min_threshold := -100;   -- Very permissive for high credibility sources
  ELSIF source_info.credibility_score >= 70 THEN
    min_threshold := -50;    -- Moderately permissive for good credibility sources
  ELSE
    -- Use original logic for lower credibility sources
    IF source_info.source_type = 'hyperlocal' THEN
      min_threshold := -50;
    ELSIF source_info.source_type = 'regional' THEN
      min_threshold := -30;
    ELSE
      min_threshold := -10;
    END IF;
  END IF;
  
  -- Only reject articles with extremely low relevance (let users decide in pipeline)
  IF NEW.regional_relevance_score < min_threshold AND NEW.processing_status = 'new' THEN
    -- Mark as discarded instead of inserting
    NEW.processing_status := 'discarded';
    -- Add rejection reason to metadata
    NEW.import_metadata := COALESCE(NEW.import_metadata, '{}')::jsonb || 
      jsonb_build_object(
        'rejection_reason', 'low_regional_relevance_credibility_filtered', 
        'relevance_score', NEW.regional_relevance_score,
        'min_threshold', min_threshold,
        'source_type', source_info.source_type,
        'source_credibility', source_info.credibility_score
      );
  END IF;
  
  -- Log the validation for debugging
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Article relevance validation with credibility bypass completed',
    jsonb_build_object(
      'article_id', NEW.id,
      'relevance_score', NEW.regional_relevance_score,
      'threshold', min_threshold,
      'processing_status', NEW.processing_status,
      'source_type', source_info.source_type,
      'source_credibility', source_info.credibility_score,
      'credibility_bypass_applied', source_info.credibility_score >= 70
    ),
    'validate_regional_relevance'
  );
  
  RETURN NEW;
END;
$function$;