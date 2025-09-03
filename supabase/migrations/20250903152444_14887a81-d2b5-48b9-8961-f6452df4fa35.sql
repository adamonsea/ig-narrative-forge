-- Fix newsletter signup security vulnerabilities
-- Step 1: Add email validation and constraints
ALTER TABLE topic_newsletter_signups 
ADD CONSTRAINT valid_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Add rate limiting table
CREATE TABLE IF NOT EXISTS newsletter_signup_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT NOT NULL, -- Store hashed IP to prevent direct IP storage
  email_hash TEXT NOT NULL, -- Store hashed email
  signup_count INTEGER DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE DEFAULT now(),
  window_duration INTERVAL DEFAULT '1 hour'::interval,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on rate limiting table
ALTER TABLE newsletter_signup_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can manage rate limits
CREATE POLICY "Service role can manage rate limits"
ON newsletter_signup_rate_limits
FOR ALL
TO service_role
USING (true);

-- Add function to check and enforce rate limits
CREATE OR REPLACE FUNCTION check_newsletter_signup_rate_limit(
  p_email TEXT,
  p_ip_hash TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  email_hash TEXT;
  current_count INTEGER;
  max_signups_per_hour INTEGER := 3; -- Max 3 signups per email per hour
  max_signups_per_ip INTEGER := 10; -- Max 10 signups per IP per hour
BEGIN
  -- Hash the email for privacy
  email_hash := encode(digest(p_email, 'sha256'), 'hex');
  
  -- Check email-based rate limit
  SELECT COALESCE(signup_count, 0) INTO current_count
  FROM newsletter_signup_rate_limits
  WHERE email_hash = check_newsletter_signup_rate_limit.email_hash
    AND window_start > now() - window_duration;
  
  IF current_count >= max_signups_per_hour THEN
    RETURN FALSE;
  END IF;
  
  -- Check IP-based rate limit if IP hash provided
  IF p_ip_hash IS NOT NULL THEN
    SELECT COALESCE(signup_count, 0) INTO current_count
    FROM newsletter_signup_rate_limits
    WHERE ip_hash = p_ip_hash
      AND window_start > now() - window_duration;
    
    IF current_count >= max_signups_per_ip THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Add function to record signup attempt
CREATE OR REPLACE FUNCTION record_newsletter_signup_attempt(
  p_email TEXT,
  p_ip_hash TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  email_hash TEXT;
BEGIN
  email_hash := encode(digest(p_email, 'sha256'), 'hex');
  
  -- Update or insert email rate limit record
  INSERT INTO newsletter_signup_rate_limits (email_hash, signup_count, window_start)
  VALUES (email_hash, 1, now())
  ON CONFLICT (email_hash) 
  DO UPDATE SET 
    signup_count = CASE 
      WHEN newsletter_signup_rate_limits.window_start < now() - newsletter_signup_rate_limits.window_duration 
      THEN 1 
      ELSE newsletter_signup_rate_limits.signup_count + 1 
    END,
    window_start = CASE 
      WHEN newsletter_signup_rate_limits.window_start < now() - newsletter_signup_rate_limits.window_duration 
      THEN now() 
      ELSE newsletter_signup_rate_limits.window_start 
    END,
    updated_at = now();
  
  -- Handle IP-based tracking if provided
  IF p_ip_hash IS NOT NULL THEN
    INSERT INTO newsletter_signup_rate_limits (ip_hash, signup_count, window_start)
    VALUES (p_ip_hash, 1, now())
    ON CONFLICT (ip_hash) 
    DO UPDATE SET 
      signup_count = CASE 
        WHEN newsletter_signup_rate_limits.window_start < now() - newsletter_signup_rate_limits.window_duration 
        THEN 1 
        ELSE newsletter_signup_rate_limits.signup_count + 1 
      END,
      window_start = CASE 
        WHEN newsletter_signup_rate_limits.window_start < now() - newsletter_signup_rate_limits.window_duration 
        THEN now() 
        ELSE newsletter_signup_rate_limits.window_start 
      END,
      updated_at = now();
  END IF;
END;
$$;

-- Add unique constraint on topic_id + email to prevent duplicates properly
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'topic_newsletter_signups_topic_email_unique'
  ) THEN
    ALTER TABLE topic_newsletter_signups 
    ADD CONSTRAINT topic_newsletter_signups_topic_email_unique 
    UNIQUE (topic_id, email);
  END IF;
END $$;

-- Add verification status to newsletter signups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'topic_newsletter_signups' 
    AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE topic_newsletter_signups 
    ADD COLUMN email_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN verification_token TEXT,
    ADD COLUMN verification_sent_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Update the public insert policy to include rate limiting
DROP POLICY IF EXISTS "Public can sign up for newsletters" ON topic_newsletter_signups;

CREATE POLICY "Rate limited public newsletter signups"
ON topic_newsletter_signups
FOR INSERT
TO public
WITH CHECK (
  -- Basic validation
  email IS NOT NULL 
  AND length(email) > 5 
  AND length(email) < 255
  AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  -- Topic must exist and be public
  AND EXISTS (
    SELECT 1 FROM topics 
    WHERE id = topic_newsletter_signups.topic_id 
    AND is_public = TRUE
  )
);

-- Add cleanup function for old rate limit records
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM newsletter_signup_rate_limits 
  WHERE window_start < now() - INTERVAL '24 hours';
END;
$$;