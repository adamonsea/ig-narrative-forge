-- Create function to automatically populate content generation queue
CREATE OR REPLACE FUNCTION auto_populate_content_queue()
RETURNS TRIGGER AS $$
BEGIN
  -- Only add to queue if article is processed and has good quality scores
  IF NEW.processing_status = 'processed' AND 
     NEW.content_quality_score >= 50 AND 
     NEW.regional_relevance_score >= 10 THEN
    
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-populating content queue
DROP TRIGGER IF EXISTS trigger_auto_populate_content_queue ON articles;
CREATE TRIGGER trigger_auto_populate_content_queue
  AFTER UPDATE OF processing_status ON articles
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_content_queue();

-- Also create function to manually approve articles for content generation
CREATE OR REPLACE FUNCTION approve_article_for_generation(article_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if article exists and is not already in queue
  IF EXISTS (
    SELECT 1 FROM articles 
    WHERE id = article_uuid 
    AND processing_status IN ('new', 'processed')
  ) AND NOT EXISTS (
    SELECT 1 FROM content_generation_queue 
    WHERE article_id = article_uuid 
    AND status != 'completed'
  ) THEN
    
    -- Update article status to processed
    UPDATE articles 
    SET processing_status = 'processed',
        updated_at = NOW()
    WHERE id = article_uuid;
    
    -- Add to generation queue
    INSERT INTO content_generation_queue (
      article_id,
      slidetype,
      status,
      created_at
    ) VALUES (
      article_uuid,
      'tabloid',
      'pending',
      NOW()
    );
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;