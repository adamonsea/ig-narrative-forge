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

-- Step 2: Enable RLS on the view
ALTER VIEW content_sources_basic ENABLE ROW LEVEL SECURITY;

-- Step 3: Update RLS policies on content_sources table
-- Remove the current overly permissive policy for regular users
DROP POLICY IF EXISTS "Content sources viewable by authenticated" ON content_sources;

-- Create role-based policies
-- Admin users get full access to the main table
CREATE POLICY "Content sources admin full access" 
ON content_sources FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role gets full access for edge functions
CREATE POLICY "Content sources service role access" 
ON content_sources FOR ALL 
USING (auth.role() = 'service_role');

-- Step 4: Create policies for the restricted view
-- Regular authenticated users can view the restricted view
CREATE POLICY "Content sources basic view for authenticated users" 
ON content_sources_basic FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Admins can also access the restricted view (though they have full access anyway)
CREATE POLICY "Content sources basic view for admins" 
ON content_sources_basic FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Step 5: Create a function to safely get source statistics for regular users
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