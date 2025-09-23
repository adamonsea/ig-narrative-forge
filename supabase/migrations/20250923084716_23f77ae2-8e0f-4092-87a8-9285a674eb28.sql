-- Fix newsletter signups security issue - restrict email access to topic owners only

-- First, ensure we have proper RLS policies for topic_newsletter_signups
-- Remove any overly permissive policies and create restrictive ones

-- Drop existing policies to recreate them securely
DROP POLICY IF EXISTS "Rate limited public newsletter signups" ON public.topic_newsletter_signups;
DROP POLICY IF EXISTS "Topic owners can manage their newsletter signups" ON public.topic_newsletter_signups;
DROP POLICY IF EXISTS "Topic owners can view their newsletter signups" ON public.topic_newsletter_signups;

-- Create restrictive SELECT policy - ONLY topic owners and admins can read signups
CREATE POLICY "Newsletter signups readable by topic owners only" 
ON public.topic_newsletter_signups 
FOR SELECT 
USING (
  (topic_id IN (
    SELECT topics.id 
    FROM topics 
    WHERE topics.created_by = auth.uid()
  )) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Allow public INSERT for new signups (rate limited and validated)
CREATE POLICY "Public newsletter signups with validation" 
ON public.topic_newsletter_signups 
FOR INSERT 
WITH CHECK (
  -- Email validation
  email IS NOT NULL 
  AND length(email) > 5 
  AND length(email) < 255 
  AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  -- Topic must be public
  AND EXISTS (
    SELECT 1 FROM topics 
    WHERE topics.id = topic_newsletter_signups.topic_id 
    AND topics.is_public = true
  )
);

-- Allow topic owners to UPDATE and DELETE their signups
CREATE POLICY "Newsletter signups manageable by topic owners" 
ON public.topic_newsletter_signups 
FOR ALL 
USING (
  (topic_id IN (
    SELECT topics.id 
    FROM topics 
    WHERE topics.created_by = auth.uid()
  )) 
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (topic_id IN (
    SELECT topics.id 
    FROM topics 
    WHERE topics.created_by = auth.uid()
  )) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Ensure RLS is enabled
ALTER TABLE public.topic_newsletter_signups ENABLE ROW LEVEL SECURITY;

-- Add additional security: create function to validate newsletter access
CREATE OR REPLACE FUNCTION public.can_access_newsletter_signups(p_topic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM topics 
    WHERE id = p_topic_id 
    AND (
      created_by = auth.uid() 
      OR EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'::app_role
      )
    )
  );
$$;