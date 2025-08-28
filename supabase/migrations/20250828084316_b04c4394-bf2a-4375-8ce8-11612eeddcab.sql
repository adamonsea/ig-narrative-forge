-- First drop all existing policies on topics table
DROP POLICY IF EXISTS "Authenticated users can create topics" ON public.topics;
DROP POLICY IF EXISTS "Topic creators manage their topics" ON public.topics;
DROP POLICY IF EXISTS "Topics viewable by access level" ON public.topics;
DROP POLICY IF EXISTS "Topics viewable by creators and admins" ON public.topics;
DROP POLICY IF EXISTS "Topic creators can update their topics" ON public.topics;
DROP POLICY IF EXISTS "Topic creators can delete their topics" ON public.topics;

-- Update existing topics to be private
UPDATE public.topics 
SET is_public = false 
WHERE name IN ('Eastbourne', 'Film for kids');

-- Add publication status to stories table for feed publishing control
ALTER TABLE public.stories 
ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

-- Create new simplified RLS policies for topics
CREATE POLICY "Topics viewable by creators and admins" 
ON public.topics 
FOR SELECT 
USING (
  auth.uid() = created_by OR 
  auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'::app_role)
);

CREATE POLICY "Users can create their own topics" 
ON public.topics 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Topic creators can update their topics" 
ON public.topics 
FOR UPDATE 
USING (
  auth.uid() = created_by OR 
  auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'::app_role)
);

CREATE POLICY "Topic creators can delete their topics" 
ON public.topics 
FOR DELETE 
USING (
  auth.uid() = created_by OR 
  auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'::app_role)
);