ALTER FUNCTION public.set_event_category(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.retag_topic_events(uuid, text, uuid[]) SECURITY INVOKER;