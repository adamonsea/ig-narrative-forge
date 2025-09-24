-- Phase 1: Fix Topics Table RLS - Add proper public access policy
-- This ensures anonymous users can access public topics

-- Drop the overly restrictive policy that only checks is_active
DROP POLICY IF EXISTS "Active topics are publicly viewable" ON public.topics;

-- Create a comprehensive policy that checks both is_active AND is_public for anonymous access
CREATE POLICY "Public topics are viewable by everyone" 
ON public.topics 
FOR SELECT 
TO anon, authenticated
USING (is_active = true AND is_public = true);

-- Ensure topic creators can still see their own topics (even if private)  
-- This policy already exists, just ensuring it's not conflicting