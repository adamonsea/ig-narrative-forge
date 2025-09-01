-- Update RLS policy to allow public access to public topics
DROP POLICY IF EXISTS "Topics viewable by creators and admins" ON topics;

CREATE POLICY "Topics viewable by creators, admins, and public topics"
ON topics FOR SELECT
USING (
  auth.uid() = created_by OR 
  auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'::app_role) OR
  (is_public = true AND is_active = true)
);