-- Fix infinite recursion in topic_memberships RLS policies
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Topic memberships manageable by owners" ON public.topic_memberships;
DROP POLICY IF EXISTS "Topic memberships viewable by members" ON public.topic_memberships;

-- Create new policies that avoid circular references
-- Topic creators (from topics.created_by) can manage memberships for their topics
CREATE POLICY "Topic creators can manage memberships" 
ON public.topic_memberships 
FOR ALL 
USING (
  auth.uid() IN (
    SELECT created_by 
    FROM topics 
    WHERE id = topic_id
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Users can view their own memberships and admins can see all
CREATE POLICY "Users can view own memberships" 
ON public.topic_memberships 
FOR SELECT 
USING (
  auth.uid() = user_id OR 
  auth.uid() IN (
    SELECT created_by 
    FROM topics 
    WHERE id = topic_id
  ) OR 
  has_role(auth.uid(), 'admin'::app_role)
);