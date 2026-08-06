CREATE OR REPLACE FUNCTION public.check_topic_slug_available(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.topics t WHERE t.slug = lower(trim(p_slug))
  );
$$;

REVOKE ALL ON FUNCTION public.check_topic_slug_available(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_topic_slug_available(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_topic_slug_available(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_topic_slug_available(text) TO service_role;