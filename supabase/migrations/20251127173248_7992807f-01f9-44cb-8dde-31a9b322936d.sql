-- Drop the broken policy that requires app.accessing_safe_fields setting
DROP POLICY IF EXISTS "Safe public topic info only" ON topics;

-- Create a corrected policy that allows authenticated users to view public active topics
CREATE POLICY "Authenticated users can view public topics"
ON topics
FOR SELECT
TO authenticated
USING (
  (is_active = true AND is_public = true)  -- Any authenticated user can see public active topics
  OR auth.uid() = created_by               -- Owners can see their own topics
  OR has_role(auth.uid(), 'admin'::app_role) -- Admins can see all
);