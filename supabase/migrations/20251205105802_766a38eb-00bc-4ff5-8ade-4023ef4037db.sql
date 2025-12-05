-- Create function to trigger drip feed scheduler when story becomes ready
CREATE OR REPLACE FUNCTION public.trigger_drip_feed_on_story_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic_id uuid;
  v_drip_enabled boolean;
  v_supabase_url text;
  v_anon_key text;
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
        -- Get Supabase URL and anon key from vault or use hardcoded project URL
        -- Using pg_net to call the edge function
        PERFORM net.http_post(
          url := current_setting('app.supabase_url', true) || '/functions/v1/drip-feed-scheduler',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key', true)
          ),
          body := jsonb_build_object('topic_id', v_topic_id::text)
        );
        
        -- Log the trigger event
        INSERT INTO system_logs (log_type, message, metadata)
        VALUES (
          'drip_feed_trigger',
          'Drip feed scheduler triggered by new ready story',
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

-- Create trigger on stories table
DROP TRIGGER IF EXISTS trigger_drip_feed_on_story_ready ON stories;

CREATE TRIGGER trigger_drip_feed_on_story_ready
  AFTER INSERT OR UPDATE OF status ON stories
  FOR EACH ROW
  EXECUTE FUNCTION trigger_drip_feed_on_story_ready();

-- Add comment explaining the trigger
COMMENT ON FUNCTION public.trigger_drip_feed_on_story_ready() IS 
'Triggers drip feed scheduler when a story status changes to ready, ensuring immediate scheduling instead of waiting for hourly cron';