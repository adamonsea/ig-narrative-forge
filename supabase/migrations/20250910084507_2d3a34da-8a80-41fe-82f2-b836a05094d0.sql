-- Add validation trigger to prevent articles under 150 words from being stored
CREATE OR REPLACE FUNCTION validate_article_word_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip validation for discarded articles (they can have any word count)
  IF NEW.processing_status = 'discarded' THEN
    RETURN NEW;
  END IF;
  
  -- Validate word count for non-discarded articles
  IF NEW.word_count IS NOT NULL AND NEW.word_count < 150 THEN
    -- Log the issue
    RAISE LOG 'Article with word_count % below threshold (150) attempted to be stored: %', NEW.word_count, NEW.title;
    
    -- Mark as discarded instead of storing
    NEW.processing_status = 'discarded';
    NEW.discard_reason = 'Below word count threshold: ' || NEW.word_count || ' words (minimum: 150)';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS validate_article_word_count_trigger ON articles;

-- Create trigger for both INSERT and UPDATE
CREATE TRIGGER validate_article_word_count_trigger
  BEFORE INSERT OR UPDATE ON articles
  FOR EACH ROW
  EXECUTE FUNCTION validate_article_word_count();

-- Clean up existing articles with word_count < 150 that aren't already discarded
UPDATE articles 
SET 
  processing_status = 'discarded',
  discard_reason = COALESCE(discard_reason, '') || ' Below word count threshold: ' || COALESCE(word_count, 0) || ' words (minimum: 150)'
WHERE 
  word_count < 150 
  AND processing_status != 'discarded'
  AND word_count IS NOT NULL;