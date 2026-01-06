-- Fix SECURITY DEFINER functions without search_path set
-- This prevents search_path manipulation attacks by locking the path

ALTER FUNCTION public.check_newsletter_signup_rate_limit(text, text) SET search_path = public;
ALTER FUNCTION public.create_default_insight_settings() SET search_path = public;
ALTER FUNCTION public.delete_event_with_backfill(uuid) SET search_path = public;
ALTER FUNCTION public.get_topic_events(uuid) SET search_path = public;
ALTER FUNCTION public.get_topic_install_stats(uuid) SET search_path = public;
ALTER FUNCTION public.get_topic_source_stats(uuid) SET search_path = public;
ALTER FUNCTION public.grant_region_access_for_topic() SET search_path = public;
ALTER FUNCTION public.handle_new_reader_profile() SET search_path = public;
ALTER FUNCTION public.record_newsletter_signup_attempt(text, text) SET search_path = public;
ALTER FUNCTION public.snapshot_sentiment_keywords() SET search_path = public;
ALTER FUNCTION public.touch_story_updated_at() SET search_path = public;