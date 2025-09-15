-- Phase 1: Database-level safety with triggers for automatic suppression

-- Create function to auto-suppress deleted topic articles
CREATE OR REPLACE FUNCTION auto_suppress_deleted_topic_article()
RETURNS TRIGGER AS $$
BEGIN
  -- When a topic_article is marked as discarded, automatically add to suppression list
  IF NEW.processing_status = 'discarded' AND (OLD.processing_status IS NULL OR OLD.processing_status != 'discarded') THEN
    -- Get the shared content info
    INSERT INTO discarded_articles (
      topic_id,
      url,
      normalized_url,
      title,
      discarded_by,
      discarded_reason,
      discarded_at
    )
    SELECT 
      NEW.topic_id,
      sac.url,
      sac.normalized_url,
      sac.title,
      auth.uid(),
      'user_delete',
      now()
    FROM shared_article_content sac
    WHERE sac.id = NEW.shared_content_id
    ON CONFLICT (topic_id, normalized_url) DO UPDATE SET
      discarded_at = now(),
      discarded_by = auth.uid(),
      discarded_reason = 'user_delete';
      
    -- Log the auto-suppression
    INSERT INTO system_logs (level, message, context, function_name)
    VALUES (
      'info',
      'Auto-suppressed deleted topic article',
      jsonb_build_object(
        'topic_article_id', NEW.id,
        'topic_id', NEW.topic_id,
        'shared_content_id', NEW.shared_content_id,
        'url', (SELECT url FROM shared_article_content WHERE id = NEW.shared_content_id)
      ),
      'auto_suppress_deleted_topic_article'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for topic_articles
DROP TRIGGER IF EXISTS auto_suppress_on_delete ON topic_articles;
CREATE TRIGGER auto_suppress_on_delete
  AFTER UPDATE ON topic_articles
  FOR EACH ROW
  EXECUTE FUNCTION auto_suppress_deleted_topic_article();

-- Create function to prevent reactivation of suppressed articles
CREATE OR REPLACE FUNCTION prevent_suppressed_reactivation()
RETURNS TRIGGER AS $$
BEGIN
  -- If article is being reactivated from discarded, check suppression list
  IF NEW.processing_status != 'discarded' AND OLD.processing_status = 'discarded' THEN
    -- Check if this article is permanently suppressed
    IF EXISTS (
      SELECT 1 FROM discarded_articles da
      JOIN shared_article_content sac ON sac.normalized_url = da.normalized_url
      WHERE da.topic_id = NEW.topic_id 
        AND sac.id = NEW.shared_content_id
    ) THEN
      -- Log the prevention
      INSERT INTO system_logs (level, message, context, function_name)
      VALUES (
        'info',
        'Prevented reactivation of suppressed article',
        jsonb_build_object(
          'topic_article_id', NEW.id,
          'topic_id', NEW.topic_id,
          'attempted_status', NEW.processing_status,
          'url', (SELECT url FROM shared_article_content WHERE id = NEW.shared_content_id)
        ),
        'prevent_suppressed_reactivation'
      );
      
      -- Keep it discarded
      NEW.processing_status := 'discarded';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to prevent reactivation
DROP TRIGGER IF EXISTS prevent_reactivation ON topic_articles;
CREATE TRIGGER prevent_reactivation
  BEFORE UPDATE ON topic_articles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_suppressed_reactivation();