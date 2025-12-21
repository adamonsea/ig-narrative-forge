-- Add missing verification columns to topic_newsletter_signups
ALTER TABLE public.topic_newsletter_signups 
ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_sent_at timestamp with time zone;

-- Add index for faster lookups by verification token
CREATE INDEX IF NOT EXISTS idx_newsletter_signups_verification_token 
ON public.topic_newsletter_signups(verification_token) 
WHERE verification_token IS NOT NULL;

-- Create subscriber_scores table for tracking play mode scores
CREATE TABLE IF NOT EXISTS public.subscriber_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  topic_id uuid REFERENCES public.topics(id) ON DELETE CASCADE,
  total_swipes integer NOT NULL DEFAULT 0,
  like_count integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  sessions_played integer NOT NULL DEFAULT 1,
  last_played_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(email, topic_id)
);

-- Enable RLS on subscriber_scores
ALTER TABLE public.subscriber_scores ENABLE ROW LEVEL SECURITY;

-- RLS policies for subscriber_scores - public read for leaderboards, write via edge functions
CREATE POLICY "Anyone can view subscriber scores for leaderboards" 
ON public.subscriber_scores 
FOR SELECT 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_subscriber_scores_updated_at
BEFORE UPDATE ON public.subscriber_scores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();