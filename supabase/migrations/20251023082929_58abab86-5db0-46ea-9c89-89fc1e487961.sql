-- Remove conflicting overloaded RPCs definitively
DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(uuid, text[], text[], integer, integer);
DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(uuid, text[], text[], text[]);