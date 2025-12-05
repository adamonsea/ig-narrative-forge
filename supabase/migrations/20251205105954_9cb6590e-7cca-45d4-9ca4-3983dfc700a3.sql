-- Update trigger to use correct system_logs columns
CREATE OR REPLACE FUNCTION public.trigger_drip_feed_on_story_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic_id uuid;
  v_drip_enabled boolean;
BEGIN
  -- Only trigger when status changes TO 'ready' (not from 'ready')
  IF NEW.status = 'ready' AND (OLD.status IS NULL OR OLD.status != 'ready') THEN
    
    -- Get topic_id from topic_article or article
    IF NEW.topic_article_id IS NOT NULL THEN
      SELECT topic_id INTO v_topic_id
      FROM topic_articles
      WHERE id = NEW.topic_article_id;
    ELSIF NEW.article_id IS NOT NULL THEN
      SELECT topic_id INTO v_topic_id
      FROM articles
      WHERE id = NEW.article_id;
    END IF;
    
    -- Check if topic has drip feed enabled
    IF v_topic_id IS NOT NULL THEN
      SELECT drip_feed_enabled INTO v_drip_enabled
      FROM topics
      WHERE id = v_topic_id AND is_active = true;
      
      IF v_drip_enabled = true THEN
        -- Log the trigger event (scheduler is now called from frontend on approval)
        INSERT INTO system_logs (level, function_name, message, context)
        VALUES (
          'info',
          'drip_feed_trigger',
          'Story became ready on drip-enabled topic',
          jsonb_build_object(
            'story_id', NEW.id,
            'topic_id', v_topic_id,
            'triggered_at', now()
          )
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_drip_feed_on_story_ready() IS 
'Logs when a story status changes to ready on a drip-enabled topic. Scheduler is called from frontend on approval.';