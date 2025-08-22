-- Add unique constraint to prevent duplicate queue entries for same article
DROP INDEX IF EXISTS idx_content_queue_unique_article_pending;
CREATE UNIQUE INDEX idx_content_queue_unique_article_pending
ON content_generation_queue (article_id)
WHERE status IN ('pending', 'processing');

-- Update the auto_populate_content_queue function to prevent duplicates
CREATE OR REPLACE FUNCTION auto_populate_content_queue()
RETURNS TRIGGER AS $$
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;