-- Fix the security definer view issue by recreating the view with security_invoker
DROP VIEW IF EXISTS content_sources_basic;

-- Recreate the view with security_invoker to respect RLS policies
CREATE VIEW content_sources_basic
WITH (security_invoker = true) AS
SELECT 
  id,
  source_name,
  canonical_domain,
  region,
  content_type,
  credibility_score,
  is_active,
  articles_scraped,
  last_scraped_at,
  created_at,
  updated_at,
  source_type,
  is_whitelisted,
  is_blacklisted
FROM content_sources;

-- Also fix the search path on the existing function to address the warning
CREATE OR REPLACE FUNCTION get_content_sources_count()
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER 
  FROM content_sources 
  WHERE is_active = true;
$$;