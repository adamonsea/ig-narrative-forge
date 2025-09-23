-- Drop all existing RLS policies on topics table to fix infinite recursion
DROP POLICY IF EXISTS "Public topics viewable by all" ON public.topics;
DROP POLICY IF EXISTS "Topic creators and admins can manage topics" ON public.topics;
DROP POLICY IF EXISTS "Topic creators can delete their topics" ON public.topics;
DROP POLICY IF EXISTS "Topic creators can update their topics" ON public.topics;
DROP POLICY IF EXISTS "Users can create their own topics" ON public.topics;
DROP POLICY IF EXISTS "Users can view topics they have access to" ON public.topics;

-- Create simple, non-recursive RLS policies for topics
-- Policy 1: Public topics are viewable by everyone
CREATE POLICY "Public topics viewable by all" 
ON public.topics 
FOR SELECT 
USING (is_active = true AND is_public = true);

-- Policy 2: Topic creators can view their own topics
CREATE POLICY "Topic creators can view their own topics" 
ON public.topics 
FOR SELECT 
USING (auth.uid() = created_by);

-- Policy 3: Topic creators can insert their own topics
CREATE POLICY "Topic creators can insert their own topics" 
ON public.topics 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

-- Policy 4: Topic creators can update their own topics
CREATE POLICY "Topic creators can update their own topics" 
ON public.topics 
FOR UPDATE 
USING (auth.uid() = created_by);

-- Policy 5: Topic creators can delete their own topics
CREATE POLICY "Topic creators can delete their own topics" 
ON public.topics 
FOR DELETE 
USING (auth.uid() = created_by);