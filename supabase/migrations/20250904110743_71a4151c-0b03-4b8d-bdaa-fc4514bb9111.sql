-- Enable Row Level Security on topic_newsletter_signups table
ALTER TABLE public.topic_newsletter_signups ENABLE ROW LEVEL SECURITY;

-- Policy 1: Topic owners can view their own newsletter signups
CREATE POLICY "Topic owners can view their newsletter signups"
ON public.topic_newsletter_signups
FOR SELECT
USING (
  topic_id IN (
    SELECT id FROM public.topics 
    WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Policy 2: Service role can insert newsletter signups (for the signup function)
CREATE POLICY "Service role can insert newsletter signups"
ON public.topic_newsletter_signups
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Policy 3: Topic owners and admins can update their newsletter signups (for verification, etc.)
CREATE POLICY "Topic owners can update their newsletter signups"
ON public.topic_newsletter_signups
FOR UPDATE
USING (
  topic_id IN (
    SELECT id FROM public.topics 
    WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Policy 4: Topic owners and admins can delete newsletter signups
CREATE POLICY "Topic owners can delete their newsletter signups"
ON public.topic_newsletter_signups
FOR DELETE
USING (
  topic_id IN (
    SELECT id FROM public.topics 
    WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);