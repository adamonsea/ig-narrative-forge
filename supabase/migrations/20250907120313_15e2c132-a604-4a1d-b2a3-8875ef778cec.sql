-- Update validate_regional_relevance function to be more permissive
-- and fix articles not appearing in pipeline

CREATE OR REPLACE FUNCTION public.validate_regional_relevance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  source_info RECORD;
  min_threshold INTEGER := 0; -- Much more permissive - let almost everything through
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
  
  -- Set very permissive thresholds - let pipeline users decide what to keep
  IF source_info.source_type = 'hyperlocal' THEN
    min_threshold := -50;   -- Very permissive for local sources
  ELSIF source_info.source_type = 'regional' THEN
    min_threshold := -30;   -- Very permissive for regional sources
  ELSE
    min_threshold := -10;   -- Still permissive for national sources
  END IF;
  
  -- Only reject articles with extremely low relevance (let users decide in pipeline)
  IF NEW.regional_relevance_score < min_threshold AND NEW.processing_status = 'new' THEN
    -- Mark as discarded instead of inserting
    NEW.processing_status := 'discarded';
    -- Add rejection reason to metadata
    NEW.import_metadata := COALESCE(NEW.import_metadata, '{}')::jsonb || 
      jsonb_build_object(
        'rejection_reason', 'extremely_low_regional_relevance', 
        'relevance_score', NEW.regional_relevance_score,
        'min_threshold', min_threshold,
        'source_type', source_info.source_type
      );
  END IF;
  
  -- Log the validation for debugging
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Article relevance validation completed',
    jsonb_build_object(
      'article_id', NEW.id,
      'relevance_score', NEW.regional_relevance_score,
      'threshold', min_threshold,
      'processing_status', NEW.processing_status,
      'source_type', source_info.source_type
    ),
    'validate_regional_relevance'
  );
  
  RETURN NEW;
END;
$function$;

-- Update articles that were incorrectly marked as discarded to be available in pipeline
UPDATE articles 
SET processing_status = 'new',
    updated_at = now()
WHERE processing_status = 'discarded' 
  AND regional_relevance_score > -50  -- Bring back articles with reasonable scores
  AND topic_id IS NOT NULL
  AND created_at > now() - INTERVAL '7 days'; -- Only recent articles

-- Log the recovery operation
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Recovered articles from overly strict relevance filtering',
  jsonb_build_object('recovery_run', true),
  'validate_regional_relevance_recovery'
);