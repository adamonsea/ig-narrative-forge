-- Drop existing functions that use digest()
DROP FUNCTION IF EXISTS check_newsletter_signup_rate_limit(TEXT, TEXT);
DROP FUNCTION IF EXISTS record_newsletter_signup_attempt(TEXT, TEXT);

-- Recreate without digest() - expect pre-hashed email from edge function
CREATE OR REPLACE FUNCTION check_newsletter_signup_rate_limit(
  p_email_hash TEXT,
  p_ip_hash TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_count INTEGER;
  max_signups_per_hour INTEGER := 3;
  max_signups_per_ip INTEGER := 10;
BEGIN
  -- Check email-based rate limit (email already hashed by caller)
  SELECT COALESCE(signup_count, 0) INTO current_count
  FROM newsletter_signup_rate_limits
  WHERE email_hash = p_email_hash
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

-- Recreate record function without digest()
CREATE OR REPLACE FUNCTION record_newsletter_signup_attempt(
  p_email_hash TEXT,
  p_ip_hash TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Upsert email-based rate limit record
  INSERT INTO newsletter_signup_rate_limits (email_hash, ip_hash, signup_count, window_start)
  VALUES (p_email_hash, COALESCE(p_ip_hash, ''), 1, now())
  ON CONFLICT (email_hash, ip_hash) 
  DO UPDATE SET 
    signup_count = CASE 
      WHEN newsletter_signup_rate_limits.window_start > now() - newsletter_signup_rate_limits.window_duration 
      THEN newsletter_signup_rate_limits.signup_count + 1
      ELSE 1
    END,
    window_start = CASE 
      WHEN newsletter_signup_rate_limits.window_start > now() - newsletter_signup_rate_limits.window_duration 
      THEN newsletter_signup_rate_limits.window_start
      ELSE now()
    END,
    updated_at = now();
END;
$$;