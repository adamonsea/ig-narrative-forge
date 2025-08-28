-- Update existing topics to be private
UPDATE public.topics 
SET is_public = false 
WHERE name IN ('Eastbourne', 'Film for kids');

-- Add publication status to stories table for feed publishing control
ALTER TABLE public.stories 
ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

-- Re-enable RLS on topics with simplified policies
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

-- Simple RLS policies for topics (avoiding has_role to prevent recursion)
CREATE POLICY "Topics viewable by creators and admins" 
ON public.topics 
FOR SELECT 
USING (
  auth.uid() = created_by OR 
  auth.uid() IN (SELECT user_id FROM user_roles WHERE role = 'admin'::app_role)
);

CREATE POLICY "Authenticated users can create topics" 
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