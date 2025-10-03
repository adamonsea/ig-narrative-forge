-- Grant client access to story RPC for public feeds
GRANT EXECUTE ON FUNCTION public.get_topic_stories_with_keywords(text, text[], text[], integer, integer) TO anon, authenticated;