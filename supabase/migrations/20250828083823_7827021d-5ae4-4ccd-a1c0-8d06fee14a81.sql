-- Fix infinite recursion in topics RLS policies
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Topics manageable by owner or admin" ON public.topics;
DROP POLICY IF EXISTS "Topics viewable by members or public" ON public.topics;
DROP POLICY IF EXISTS "Users can create topics" ON public.topics;

-- Create new simplified policies that avoid infinite recursion
-- Topic creators can manage their own topics, admins can manage all
CREATE POLICY "Topic creators manage their topics" 
ON public.topics 
FOR ALL 
USING (
  auth.uid() = created_by OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Public topics are viewable by all, private topics only by creator/admin
CREATE POLICY "Topics viewable by access level" 
ON public.topics 
FOR SELECT 
USING (
  is_public = true OR 
  auth.uid() = created_by OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Users can create topics (will be owned by them)
CREATE POLICY "Authenticated users can create topics" 
ON public.topics 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = created_by);