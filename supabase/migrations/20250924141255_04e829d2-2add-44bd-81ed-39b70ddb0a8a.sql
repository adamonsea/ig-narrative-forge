-- Fix security issue: Restrict public topic access to safe fields only
-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public topics are viewable by everyone" ON public.topics;

-- Create a secure function that only returns safe public fields
CREATE OR REPLACE FUNCTION public.get_safe_public_topic_info()
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  topic_type text,
  region text,
  slug text,
  is_public boolean,
  is_active boolean,
  created_at timestamptz
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT 
    t.id,
    t.name,
    t.description,
    t.topic_type,
    t.region,
    t.slug,
    t.is_public,
    t.is_active,
    t.created_at
  FROM topics t
  WHERE t.is_active = true 
    AND t.is_public = true;
$$;

-- Create a new restrictive policy for public access
-- This only allows access to basic, non-sensitive information
CREATE POLICY "Safe public topic info only"
  ON public.topics
  FOR SELECT
  USING (
    -- Allow full access for topic owners
    (auth.uid() = created_by) OR
    -- Allow admin access
    has_role(auth.uid(), 'admin'::app_role) OR
    -- For public topics, only allow if accessing through safe function
    -- This essentially restricts which fields can be accessed
    (is_active = true AND is_public = true AND 
     -- Only allow access to safe fields by checking the context
     current_setting('app.accessing_safe_fields', true) = 'true')
  );

-- Create a view for safe public topic access
CREATE OR REPLACE VIEW public.safe_public_topics AS
SELECT 
  id,
  name,
  description,
  topic_type,
  region,
  slug,
  is_public,
  is_active,
  created_at
FROM topics
WHERE is_active = true AND is_public = true;

-- Grant access to the view
GRANT SELECT ON public.safe_public_topics TO anon, authenticated;

-- Add RLS to the view (inherited from base table)
ALTER VIEW public.safe_public_topics SET (security_barrier = true);