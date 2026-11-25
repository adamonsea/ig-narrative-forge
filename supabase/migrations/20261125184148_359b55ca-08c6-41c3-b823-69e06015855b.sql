CREATE OR REPLACE FUNCTION public.get_swipe_insights(p_topic_id uuid)
 RETURNS TABLE(total_readers bigint, total_likes bigint, total_discards bigint, approval_rate numeric, top_stories jsonb, bottom_stories jsonb)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_view_topic_stats(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  WITH swipe_data AS (SELECT ss.story_id, ss.user_id, ss.swipe_type FROM story_swipes ss WHERE ss.topic_id = p_topic_id),
  story_stats AS (
    SELECT sd.story_id, s.title,
      COUNT(*) FILTER (WHERE sd.swipe_type = 'like') as likes,
      COUNT(*) FILTER (WHERE sd.swipe_type = 'discard') as dislikes,
      COUNT(*) as total_swipes
    FROM swipe_data sd JOIN stories s ON s.id = sd.story_id GROUP BY sd.story_id, s.title),
  top_5 AS (SELECT jsonb_agg(jsonb_build_object('story_id',story_id,'title',title,'likes',likes,'dislikes',dislikes) ORDER BY likes DESC, total_swipes DESC) as stories
    FROM (SELECT * FROM story_stats WHERE total_swipes > 0 ORDER BY likes DESC, total_swipes DESC LIMIT 5) t),
  bottom_5 AS (SELECT jsonb_agg(jsonb_build_object('story_id',story_id,'title',title,'likes',likes,'dislikes',dislikes) ORDER BY dislikes DESC, likes ASC) as stories
    FROM (SELECT * FROM story_stats WHERE dislikes > 0 ORDER BY dislikes DESC, likes ASC LIMIT 5) t)
  SELECT
    (SELECT COUNT(DISTINCT user_id) FROM swipe_data)::bigint,
    (SELECT COUNT(*) FILTER (WHERE swipe_type = 'like') FROM swipe_data)::bigint,
    (SELECT COUNT(*) FILTER (WHERE swipe_type = 'discard') FROM swipe_data)::bigint,
    CASE WHEN (SELECT COUNT(*) FROM swipe_data) > 0
      THEN ROUND((SELECT COUNT(*) FILTER (WHERE swipe_type = 'like') FROM swipe_data)::numeric / (SELECT COUNT(*) FROM swipe_data)::numeric * 100, 1)
      ELSE 0 END,
    COALESCE((SELECT stories FROM top_5), '[]'::jsonb),
    COALESCE((SELECT stories FROM bottom_5), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_topic_quiz_stats(p_topic_id uuid, p_days integer DEFAULT 7)
 RETURNS TABLE(quiz_responses_count bigint, correct_rate numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_view_topic_stats(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT COUNT(qr.id)::BIGINT,
    CASE WHEN COUNT(qr.id) > 0 THEN ROUND((COUNT(*) FILTER (WHERE qr.is_correct = true)::NUMERIC / COUNT(qr.id)::NUMERIC) * 100, 1) ELSE 0 END
  FROM quiz_responses qr JOIN quiz_questions qq ON qq.id = qr.question_id
  WHERE qq.topic_id = p_topic_id AND qr.created_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_topic_engagement_stats(p_topic_id uuid)
 RETURNS TABLE(notifications_enabled bigint, pwa_installs bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_view_topic_stats(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT COUNT(*) FILTER (WHERE metric_type = 'notification_enabled'), COUNT(*) FILTER (WHERE metric_type = 'pwa_installed')
  FROM topic_engagement_metrics WHERE topic_id = p_topic_id;
END;
$function$;

-- Reader-facing social proof: install count only (already shown on install prompts).
CREATE OR REPLACE FUNCTION public.get_topic_install_count(p_topic_id uuid)
 RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COUNT(*) FROM topic_engagement_metrics WHERE topic_id = p_topic_id AND metric_type = 'pwa_installed' $$;
GRANT EXECUTE ON FUNCTION public.get_topic_install_count(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_daily_story_counts(p_topic_id uuid, p_days integer DEFAULT 7)
 RETURNS TABLE(date date, story_count bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_view_topic_stats(p_topic_id) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  WITH date_series AS (SELECT generate_series(CURRENT_DATE - (p_days - 1), CURRENT_DATE, '1 day'::interval)::date as date),
  daily_counts AS (
    SELECT s.created_at::date as story_date, COUNT(*) as cnt
    FROM stories s JOIN topic_articles ta ON ta.id = s.topic_article_id
    WHERE ta.topic_id = p_topic_id AND s.created_at >= (CURRENT_DATE - p_days)
    GROUP BY s.created_at::date)
  SELECT ds.date, COALESCE(dc.cnt, 0)::bigint FROM date_series ds LEFT JOIN daily_counts dc ON dc.story_date = ds.date ORDER BY ds.date;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_subscriber_score(p_topic_id uuid, p_email text)
 RETURNS TABLE(total_swipes integer, like_count integer, best_streak integer, sessions_played integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT total_swipes, like_count, best_streak, sessions_played
  FROM public.subscriber_scores
  WHERE topic_id = p_topic_id AND lower(email) = lower(p_email)
    AND (public.can_view_topic_stats(p_topic_id)
         OR lower(p_email) = lower(coalesce((select auth.jwt()) ->> 'email', '')))
  LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_drip_feed_event(uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_drip_feed_event(uuid, text, uuid, jsonb) TO service_role;