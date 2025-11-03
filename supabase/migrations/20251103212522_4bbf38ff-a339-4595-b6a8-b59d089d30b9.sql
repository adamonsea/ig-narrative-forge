-- Phase 5: Add database-level safety net for competing region validation
-- This trigger logs warnings when articles mentioning competing regions are inserted

CREATE OR REPLACE FUNCTION check_competing_regions_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  article_title TEXT;
  topic_region TEXT;
  competing_regions TEXT[];
  competing_region TEXT;
BEGIN
  -- Get the article title from shared_article_content
  SELECT title INTO article_title
  FROM shared_article_content
  WHERE id = NEW.shared_content_id;
  
  -- Get the topic's region and competing_regions
  SELECT region, competing_regions INTO topic_region, competing_regions
  FROM topics
  WHERE id = NEW.topic_id
    AND topic_type = 'regional';
  
  -- If not a regional topic, allow insertion
  IF topic_region IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if article title mentions any competing regions
  IF competing_regions IS NOT NULL THEN
    FOREACH competing_region IN ARRAY competing_regions
    LOOP
      IF article_title ILIKE '%' || competing_region || '%' THEN
        -- Log the validation warning
        INSERT INTO system_logs (level, message, context, function_name)
        VALUES (
          'warn',
          'Competing region detected in article insertion',
          jsonb_build_object(
            'article_title', substring(article_title from 1 for 100),
            'topic_id', NEW.topic_id,
            'topic_region', topic_region,
            'competing_region_found', competing_region,
            'action', 'allowed_with_warning',
            'relevance_score', NEW.regional_relevance_score
          ),
          'check_competing_regions_before_insert'
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on topic_articles
DROP TRIGGER IF EXISTS validate_competing_regions ON topic_articles;
CREATE TRIGGER validate_competing_regions
BEFORE INSERT ON topic_articles
FOR EACH ROW
EXECUTE FUNCTION check_competing_regions_before_insert();

-- Log migration completion
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Phase 5: Database-level competing region validation installed',
  jsonb_build_object(
    'trigger', 'validate_competing_regions',
    'enforcement', 'soft_warning',
    'status', 'completed'
  ),
  'migration_safety_net'
);