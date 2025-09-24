-- Grant EXECUTE permissions on public topic functions for anonymous access
GRANT EXECUTE ON FUNCTION public.get_safe_public_topics() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_safe_public_topic_info() TO anon, authenticated;