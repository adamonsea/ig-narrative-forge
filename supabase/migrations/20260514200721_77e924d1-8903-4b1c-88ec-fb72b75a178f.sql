-- 1. Remove the policy that made every email publicly readable.
DROP POLICY IF EXISTS "Anyone can view subscriber scores for leaderboards"
  ON public.subscriber_scores;

-- 2. Public leaderboard: masked emails only, no PII leaves the database.
CREATE OR REPLACE FUNCTION public.get_subscriber_leaderboard(p_topic_id uuid)
RETURNS TABLE (
  display_name text,
  total_swipes integer,
  like_count integer,
  best_streak integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN position('@' IN s.email) <= 1 THEN '***'
      WHEN position('@' IN s.email) <= 3
        THEN substring(s.email FROM 1 FOR 1) || '***' ||
             substring(s.email FROM position('@' IN s.email))
      ELSE substring(s.email FROM 1 FOR 2) || '***' ||
           substring(s.email FROM position('@' IN s.email))
    END AS display_name,
    s.total_swipes,
    s.like_count,
    s.best_streak
  FROM public.subscriber_scores s
  WHERE s.topic_id = p_topic_id
  ORDER BY s.total_swipes DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscriber_leaderboard(uuid)
  TO anon, authenticated;

-- 3. Personal score lookup for a verified subscriber (caller must know the email).
CREATE OR REPLACE FUNCTION public.get_subscriber_score(
  p_topic_id uuid,
  p_email text
)
RETURNS TABLE (
  total_swipes integer,
  like_count integer,
  best_streak integer,
  sessions_played integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT total_swipes, like_count, best_streak, sessions_played
  FROM public.subscriber_scores
  WHERE topic_id = p_topic_id
    AND lower(email) = lower(p_email)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscriber_score(uuid, text)
  TO anon, authenticated;

-- 4. Upsert helper so the play app can record results without direct table SELECT/UPDATE.
CREATE OR REPLACE FUNCTION public.upsert_subscriber_score(
  p_topic_id uuid,
  p_email text,
  p_total_swipes integer,
  p_like_count integer,
  p_best_streak integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(p_email);
BEGIN
  -- Only allow the upsert if the caller is a verified subscriber for this topic.
  IF NOT EXISTS (
    SELECT 1
    FROM public.topic_newsletter_signups
    WHERE topic_id = p_topic_id
      AND lower(email) = v_email
      AND email_verified = true
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Subscriber not verified for this topic';
  END IF;

  INSERT INTO public.subscriber_scores (
    topic_id, email, total_swipes, like_count, best_streak, sessions_played, last_played_at
  )
  VALUES (
    p_topic_id, v_email, p_total_swipes, p_like_count, p_best_streak, 1, now()
  )
  ON CONFLICT (topic_id, email) DO UPDATE
    SET total_swipes    = public.subscriber_scores.total_swipes + EXCLUDED.total_swipes,
        like_count      = public.subscriber_scores.like_count + EXCLUDED.like_count,
        best_streak     = GREATEST(public.subscriber_scores.best_streak, EXCLUDED.best_streak),
        sessions_played = public.subscriber_scores.sessions_played + 1,
        last_played_at  = now(),
        updated_at      = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_subscriber_score(uuid, text, integer, integer, integer)
  TO anon, authenticated;