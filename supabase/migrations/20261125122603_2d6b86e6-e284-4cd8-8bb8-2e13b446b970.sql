CREATE OR REPLACE FUNCTION public.show_events_in_feed_on_enable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.events_enabled IS TRUE AND (TG_OP = 'INSERT' OR OLD.events_enabled IS DISTINCT FROM TRUE) THEN
    INSERT INTO public.topic_insight_settings (topic_id, events_cards_enabled)
    VALUES (NEW.id, true)
    ON CONFLICT (topic_id) DO UPDATE SET events_cards_enabled = true;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.show_events_in_feed_on_enable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS show_events_in_feed_on_enable ON public.topics;
CREATE TRIGGER show_events_in_feed_on_enable
AFTER INSERT OR UPDATE OF events_enabled ON public.topics
FOR EACH ROW EXECUTE FUNCTION public.show_events_in_feed_on_enable();