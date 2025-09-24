-- Fix remaining function search paths for security
ALTER FUNCTION public.update_events_updated_at_column() SET search_path = 'public';
ALTER FUNCTION public.articles_search_tsv() SET search_path = 'public';
ALTER FUNCTION public.reset_stalled_processing() SET search_path = 'public';
ALTER FUNCTION public.reset_stalled_stories() SET search_path = 'public';
ALTER FUNCTION public.cleanup_stuck_scrape_jobs() SET search_path = 'public';
ALTER FUNCTION public.update_cron_schedules() SET search_path = 'public';