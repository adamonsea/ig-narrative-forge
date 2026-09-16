
REVOKE EXECUTE ON FUNCTION public.get_topic_coverage_mix(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_topic_rising_terms(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_topic_live_readers(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_topic_daily_flow(uuid, integer) FROM PUBLIC, anon;
