-- Fix security issue: Restrict access to topic_newsletter_signups table
-- Only topic owners and admins should be able to read subscriber emails

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can sign up for newsletters" ON public.topic_newsletter_signups;
DROP POLICY IF EXISTS "Topic owners can view their newsletter signups" ON public.topic_newsletter_signups;

-- Create secure policies
-- Allow public to insert (sign up for newsletters)
CREATE POLICY "Public can sign up for newsletters" 
ON public.topic_newsletter_signups 
FOR INSERT 
TO public
WITH CHECK (true);

-- Only topic owners and admins can view email addresses
CREATE POLICY "Topic owners can view their newsletter signups" 
ON public.topic_newsletter_signups 
FOR SELECT 
TO authenticated
USING (
  topic_id IN (
    SELECT topics.id
    FROM topics
    WHERE topics.created_by = auth.uid()
  ) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Only topic owners and admins can manage signups (update/delete)
CREATE POLICY "Topic owners can manage their newsletter signups" 
ON public.topic_newsletter_signups 
FOR ALL 
TO authenticated
USING (
  topic_id IN (
    SELECT topics.id
    FROM topics
    WHERE topics.created_by = auth.uid()
  ) 
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  topic_id IN (
    SELECT topics.id
    FROM topics
    WHERE topics.created_by = auth.uid()
  ) 
  OR has_role(auth.uid(), 'admin'::app_role)
);