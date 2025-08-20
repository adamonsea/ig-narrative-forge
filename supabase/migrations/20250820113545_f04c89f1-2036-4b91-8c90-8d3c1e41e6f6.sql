-- Add regional relevance filter for content sources to reject articles below threshold
ALTER TABLE articles ADD COLUMN IF NOT EXISTS regional_relevance_score integer DEFAULT 0;

-- Add regional filtering function to validate articles before insertion
CREATE OR REPLACE FUNCTION validate_regional_relevance()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate regional relevance score from import metadata
  IF NEW.import_metadata IS NOT NULL AND 
     (NEW.import_metadata->>'regional_relevance_score')::integer IS NOT NULL THEN
    NEW.regional_relevance_score := (NEW.import_metadata->>'regional_relevance_score')::integer;
  END IF;
  
  -- Reject articles with very low regional relevance (below 20 points)
  IF NEW.regional_relevance_score < 20 AND NEW.processing_status = 'new' THEN
    -- Mark as discarded instead of inserting
    NEW.processing_status := 'discarded';
    -- Add rejection reason to metadata
    NEW.import_metadata := COALESCE(NEW.import_metadata, '{}')::jsonb || 
      '{"rejection_reason": "insufficient_regional_relevance", "relevance_score": ' || NEW.regional_relevance_score || '}';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for regional validation
DROP TRIGGER IF EXISTS validate_regional_relevance_trigger ON articles;
CREATE TRIGGER validate_regional_relevance_trigger
  BEFORE INSERT OR UPDATE ON articles
  FOR EACH ROW
  EXECUTE FUNCTION validate_regional_relevance();