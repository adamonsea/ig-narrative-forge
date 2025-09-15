-- Create waitlist table for collecting email addresses
CREATE TABLE public.waitlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Create policies for waitlist (public can insert, only admins can view)
CREATE POLICY "Anyone can join waitlist" 
ON public.waitlist 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Only admins can view waitlist" 
ON public.waitlist 
FOR SELECT 
USING (false); -- No one can read for now, as requested

-- Create index on email for performance
CREATE INDEX idx_waitlist_email ON public.waitlist(email);

-- Create index on created_at for ordering
CREATE INDEX idx_waitlist_created_at ON public.waitlist(created_at);