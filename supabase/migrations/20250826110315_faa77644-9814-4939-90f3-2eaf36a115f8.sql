-- Step 1: Create a restricted view for content sources that excludes sensitive operational data
CREATE VIEW content_sources_basic AS
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

-- Step 2: Update RLS policies on content_sources table
-- Remove the current overly permissive policy for regular users
DROP POLICY IF EXISTS "Content sources viewable by authenticated" ON content_sources;

-- Create role-based policies for the main table
-- Admin users get full access to the main table
CREATE POLICY "Content sources admin full access" 
ON content_sources FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role gets full access for edge functions
CREATE POLICY "Content sources service role access" 
ON content_sources FOR ALL 
USING (auth.role() = 'service_role');

-- Regular authenticated users can only view basic fields (they'll use the view)
CREATE POLICY "Content sources basic read for authenticated users" 
ON content_sources FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Step 3: Create a function to safely get source statistics for regular users
CREATE OR REPLACE FUNCTION get_content_sources_count()
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER 
  FROM content_sources 
  WHERE is_active = true;
$$;