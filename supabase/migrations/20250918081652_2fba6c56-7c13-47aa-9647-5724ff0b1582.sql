-- Fix the search_path security warning for the function I just created
ALTER FUNCTION public.get_article_content_unified(uuid, uuid, uuid) SET search_path = 'public';