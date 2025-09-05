-- Add a feature flag to control auto-population of content queue
INSERT INTO feature_flags (flag_name, enabled, description, config) 
VALUES (
  'auto_simplify_articles', 
  false, 
  'Automatically add processed articles to content generation queue',
  '{"default_enabled": false, "requires_user_opt_in": true}'
) ON CONFLICT (flag_name) DO UPDATE SET 
  enabled = false,
  description = EXCLUDED.description,
  config = EXCLUDED.config;

-- Update the auto_populate_content_queue function to check the feature flag
CREATE OR REPLACE FUNCTION public.auto_populate_content_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if auto-simplify feature is enabled
  IF NOT is_feature_enabled('auto_simplify_articles') THEN
    RETURN NEW;
  END IF;

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