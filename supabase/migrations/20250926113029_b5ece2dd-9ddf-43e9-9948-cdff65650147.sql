-- Grant permissions for the updated get_public_topic_feed function
GRANT EXECUTE ON FUNCTION public.get_public_topic_feed(topic_slug_param text, p_limit integer, p_offset integer, p_sort_by text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_topic_feed(topic_slug_param text, p_limit integer, p_offset integer, p_sort_by text) TO authenticated;