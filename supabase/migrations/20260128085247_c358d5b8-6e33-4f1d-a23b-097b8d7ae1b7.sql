
-- Create a security definer function to get topic ID by slug
-- This bypasses RLS to ensure visitor tracking works for all topics
CREATE OR REPLACE FUNCTION public.get_topic_id_by_slug(topic_slug text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM topics WHERE lower(slug) = lower(topic_slug) LIMIT 1;
$$;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.get_topic_id_by_slug(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_topic_id_by_slug(text) TO authenticated;
