-- Create table for topic newsletter signups
CREATE TABLE public.topic_newsletter_signups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(topic_id, email)
);

-- Enable Row Level Security
ALTER TABLE public.topic_newsletter_signups ENABLE ROW LEVEL SECURITY;

-- Create policy so only topic owners can view their signups
CREATE POLICY "Topic owners can view their newsletter signups" 
ON public.topic_newsletter_signups 
FOR ALL
USING (
  topic_id IN (
    SELECT id FROM public.topics 
    WHERE created_by = auth.uid()
  )
);

-- Create policy for public insertion (allow anyone to sign up)
CREATE POLICY "Anyone can sign up for newsletters" 
ON public.topic_newsletter_signups 
FOR INSERT 
WITH CHECK (true);

-- Create index for better performance
CREATE INDEX idx_topic_newsletter_signups_topic_id ON public.topic_newsletter_signups(topic_id);
CREATE INDEX idx_topic_newsletter_signups_email ON public.topic_newsletter_signups(email);