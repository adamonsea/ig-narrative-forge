-- Platform-level fix: Update validation function to be much more permissive
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
  
  -- MUCH MORE PERMISSIVE THRESHOLDS (Platform-level fix)
  IF source_info.credibility_score >= 90 THEN
    min_threshold := -10000;  -- Complete bypass for highest credibility sources
  ELSIF source_info.credibility_score >= 80 THEN
    min_threshold := -1000;   -- Near-complete bypass for high credibility sources
  ELSIF source_info.credibility_score >= 70 THEN
    min_threshold := -500;    -- Very permissive for good credibility sources
  ELSIF source_info.credibility_score >= 60 THEN
    min_threshold := -100;    -- Still very permissive for decent sources
  ELSE
    -- More lenient thresholds for lower credibility sources
    IF source_info.source_type = 'hyperlocal' THEN
      min_threshold := -75;   -- Local sources very permissive
    ELSIF source_info.source_type = 'regional' THEN
      min_threshold := -50;   -- Regional sources permissive
    ELSE
      min_threshold := -25;   -- National sources still lenient
    END IF;
  END IF;
  
  -- Only reject articles with extremely poor relevance scores
  IF NEW.regional_relevance_score < min_threshold AND NEW.processing_status = 'new' THEN
    -- Mark as discarded instead of inserting
    NEW.processing_status := 'discarded';
    -- Add rejection reason to metadata
    NEW.import_metadata := COALESCE(NEW.import_metadata, '{}')::jsonb || 
      jsonb_build_object(
        'rejection_reason', 'extremely_low_relevance_platform_filtered', 
        'relevance_score', NEW.regional_relevance_score,
        'min_threshold', min_threshold,
        'source_type', source_info.source_type,
        'source_credibility', source_info.credibility_score,
        'platform_fix_applied', true
      );
  END IF;
  
  -- Log the validation for debugging
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Platform-level permissive validation completed',
    jsonb_build_object(
      'article_id', NEW.id,
      'relevance_score', NEW.regional_relevance_score,
      'threshold', min_threshold,
      'processing_status', NEW.processing_status,
      'source_type', source_info.source_type,
      'source_credibility', source_info.credibility_score,
      'platform_fix_applied', true
    ),
    'validate_regional_relevance'
  );
  
  RETURN NEW;
END;
$function$;

-- Also update the content quality thresholds to be more lenient
UPDATE feature_flags 
SET config = jsonb_build_object(
  'minimum_word_count', 25,
  'minimum_quality_score', 15,
  'credibility_bypass_threshold', 60
)
WHERE flag_name = 'content_validation_thresholds';