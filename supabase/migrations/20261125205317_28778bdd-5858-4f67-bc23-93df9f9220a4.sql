DROP POLICY IF EXISTS "Content generation queue viewable by region access" ON public.content_generation_queue;
DROP POLICY IF EXISTS "Content generation queue manageable by region access" ON public.content_generation_queue;

CREATE POLICY "Queue: owners see own feeds" ON public.content_generation_queue
FOR ALL TO authenticated, service_role
USING (
  (select auth.role()) = 'service_role'
  OR public.has_role((select auth.uid()), 'admin'::app_role)
  OR public.has_role((select auth.uid()), 'superadmin'::app_role)
  OR EXISTS (SELECT 1 FROM public.articles a JOIN public.topics t ON t.id = a.topic_id
             WHERE a.id = content_generation_queue.article_id AND t.created_by = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.topic_articles ta JOIN public.topics t ON t.id = ta.topic_id
             WHERE ta.id = content_generation_queue.topic_article_id AND t.created_by = (select auth.uid()))
)
WITH CHECK (
  (select auth.role()) = 'service_role'
  OR public.has_role((select auth.uid()), 'admin'::app_role)
  OR public.has_role((select auth.uid()), 'superadmin'::app_role)
  OR EXISTS (SELECT 1 FROM public.articles a JOIN public.topics t ON t.id = a.topic_id
             WHERE a.id = content_generation_queue.article_id AND t.created_by = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.topic_articles ta JOIN public.topics t ON t.id = ta.topic_id
             WHERE ta.id = content_generation_queue.topic_article_id AND t.created_by = (select auth.uid()))
);

DROP FUNCTION IF EXISTS public.get_subscriber_status(uuid, text);
CREATE FUNCTION public.get_subscriber_status(p_topic_id uuid, p_token text)
RETURNS TABLE(email text, notification_type text, email_verified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(s.email), s.notification_type, s.email_verified
  FROM public.topic_newsletter_signups s
  WHERE s.topic_id = p_topic_id
    AND p_token IS NOT NULL AND length(p_token) >= 16
    AND s.verification_token = p_token
    AND s.email_verified = true AND s.is_active = true;
$$;
GRANT EXECUTE ON FUNCTION public.get_subscriber_status(uuid, text) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.upsert_subscriber_score(uuid, text, integer, integer, integer);
CREATE FUNCTION public.upsert_subscriber_score(p_topic_id uuid, p_token text, p_total_swipes integer, p_like_count integer, p_best_streak integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  SELECT lower(email) INTO v_email FROM public.topic_newsletter_signups
  WHERE topic_id = p_topic_id AND p_token IS NOT NULL AND length(p_token) >= 16
    AND verification_token = p_token AND email_verified = true AND is_active = true
  LIMIT 1;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Subscriber not verified for this topic'; END IF;
  INSERT INTO public.subscriber_scores (topic_id, email, total_swipes, like_count, best_streak, sessions_played, last_played_at)
  VALUES (p_topic_id, v_email, GREATEST(p_total_swipes,0), GREATEST(p_like_count,0), GREATEST(p_best_streak,0), 1, now())
  ON CONFLICT (topic_id, email) DO UPDATE
    SET total_swipes = public.subscriber_scores.total_swipes + EXCLUDED.total_swipes,
        like_count = public.subscriber_scores.like_count + EXCLUDED.like_count,
        best_streak = GREATEST(public.subscriber_scores.best_streak, EXCLUDED.best_streak),
        sessions_played = public.subscriber_scores.sessions_played + 1,
        last_played_at = now(), updated_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.upsert_subscriber_score(uuid, text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_subscriber_score(uuid, text, integer, integer, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_source_validate_rate(p_user uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM public.rate_limits WHERE endpoint = 'validate-content-source' AND user_id = p_user AND window_start < now() - interval '1 hour';
  SELECT count(*) INTO v_count FROM public.rate_limits WHERE endpoint = 'validate-content-source' AND user_id = p_user;
  IF v_count >= 30 THEN RETURN false; END IF;
  INSERT INTO public.rate_limits (user_id, endpoint, requests, window_start, window_duration, max_requests)
  VALUES (p_user, 'validate-content-source', 1, now(), interval '1 hour', 30);
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.check_source_validate_rate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_source_validate_rate(uuid) TO service_role;