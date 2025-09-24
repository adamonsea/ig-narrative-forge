-- Simple security fix: Create a function to safely access public topic info
-- This avoids complex policy changes and deadlock issues

CREATE OR REPLACE FUNCTION public.get_safe_public_topics()
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  topic_type text,
  region text,
  slug text,
  created_at timestamptz
) 
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 
    t.id,
    t.name,
    t.description,
    t.topic_type,
    t.region,
    t.slug,
    t.created_at
  FROM topics t
  WHERE t.is_active = true 
    AND t.is_public = true;
$$;

-- Grant public access to this safe function
GRANT EXECUTE ON FUNCTION public.get_safe_public_topics() TO anon, authenticated;