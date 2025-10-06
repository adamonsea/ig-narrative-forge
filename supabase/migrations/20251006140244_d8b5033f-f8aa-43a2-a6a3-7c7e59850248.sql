-- Add policy for anonymous users to view public topics
CREATE POLICY "Anonymous users can view public topics"
  ON public.topics
  FOR SELECT
  TO anon
  USING (is_active = true AND is_public = true);

-- Drop and recreate safe_public_topics view with security_invoker
DROP VIEW IF EXISTS safe_public_topics;

CREATE VIEW safe_public_topics 
WITH (security_invoker=true)
AS 
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
WHERE is_active = true 
  AND is_public = true;