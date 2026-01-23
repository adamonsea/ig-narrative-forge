-- Drop existing function and recreate with site_visits
DROP FUNCTION IF EXISTS public.get_user_dashboard_stats(uuid);

CREATE OR REPLACE FUNCTION public.get_user_dashboard_stats(p_user_id uuid)
RETURNS TABLE (
  topic_id uuid,
  articles_in_arrivals bigint,
  stories_published bigint,
  visitors_today bigint,
  visitors_week bigint,
  play_visitors_week bigint,
  total_likes bigint,
  total_shares bigint,
  total_swipes bigint,
  avg_engagement_pct numeric,
  funnel_arrivals bigint,
  funnel_approved bigint,
  funnel_published bigint,
  avg_swipes_per_session numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_week_start date := CURRENT_DATE - INTERVAL '6 days';
BEGIN
  RETURN QUERY
  WITH user_topics AS (
    SELECT t.id FROM topics t WHERE t.created_by = p_user_id
  ),
  article_counts AS (
    SELECT 
      a.topic_id,
      COUNT(*) FILTER (WHERE a.processing_status = 'pending') as in_arrivals
    FROM articles a
    WHERE a.topic_id IN (SELECT id FROM user_topics)
    GROUP BY a.topic_id
  ),
  story_counts AS (
    SELECT 
      s.topic_id,
      COUNT(*) FILTER (WHERE s.status = 'published') as published
    FROM stories s
    WHERE s.topic_id IN (SELECT id FROM user_topics)
    GROUP BY s.topic_id
  ),
  -- Use site_visits instead of feed_visits for comprehensive tracking
  visitor_stats AS (
    SELECT 
      sv.topic_id,
      COUNT(DISTINCT sv.visitor_id) FILTER (WHERE sv.visit_date = v_today AND sv.page_type IN ('feed', 'story')) as today,
      COUNT(DISTINCT sv.visitor_id) FILTER (WHERE sv.visit_date >= v_week_start AND sv.page_type IN ('feed', 'story', 'play')) as week,
      COUNT(DISTINCT sv.visitor_id) FILTER (WHERE sv.visit_date >= v_week_start AND sv.page_type = 'play') as play_week
    FROM site_visits sv
    WHERE sv.topic_id IN (SELECT id FROM user_topics)
    GROUP BY sv.topic_id
  ),
  engagement_stats AS (
    SELECT 
      tem.topic_id,
      COUNT(*) FILTER (WHERE tem.metric_type = 'like') as likes,
      COUNT(*) FILTER (WHERE tem.metric_type = 'share') as shares,
      COUNT(*) FILTER (WHERE tem.metric_type = 'swipe') as swipes
    FROM topic_engagement_metrics tem
    WHERE tem.topic_id IN (SELECT id FROM user_topics)
      AND tem.created_at >= v_week_start
    GROUP BY tem.topic_id
  ),
  funnel_data AS (
    SELECT 
      ta.topic_id,
      COUNT(*) FILTER (WHERE ta.stage IN ('arrivals', 'approved', 'published')) as arrivals,
      COUNT(*) FILTER (WHERE ta.stage IN ('approved', 'published')) as approved,
      COUNT(*) FILTER (WHERE ta.stage = 'published') as published
    FROM topic_articles ta
    WHERE ta.topic_id IN (SELECT id FROM user_topics)
    GROUP BY ta.topic_id
  )
  SELECT 
    ut.id as topic_id,
    COALESCE(ac.in_arrivals, 0)::bigint as articles_in_arrivals,
    COALESCE(sc.published, 0)::bigint as stories_published,
    COALESCE(vs.today, 0)::bigint as visitors_today,
    COALESCE(vs.week, 0)::bigint as visitors_week,
    COALESCE(vs.play_week, 0)::bigint as play_visitors_week,
    COALESCE(es.likes, 0)::bigint as total_likes,
    COALESCE(es.shares, 0)::bigint as total_shares,
    COALESCE(es.swipes, 0)::bigint as total_swipes,
    CASE WHEN vs.week > 0 
      THEN ROUND((COALESCE(es.likes, 0) + COALESCE(es.shares, 0))::numeric / vs.week * 100, 1)
      ELSE 0 
    END as avg_engagement_pct,
    COALESCE(fd.arrivals, 0)::bigint as funnel_arrivals,
    COALESCE(fd.approved, 0)::bigint as funnel_approved,
    COALESCE(fd.published, 0)::bigint as funnel_published,
    CASE WHEN vs.week > 0 
      THEN ROUND(COALESCE(es.swipes, 0)::numeric / vs.week, 1)
      ELSE 0 
    END as avg_swipes_per_session
  FROM user_topics ut
  LEFT JOIN article_counts ac ON ut.id = ac.topic_id
  LEFT JOIN story_counts sc ON ut.id = sc.topic_id
  LEFT JOIN visitor_stats vs ON ut.id = vs.topic_id
  LEFT JOIN engagement_stats es ON ut.id = es.topic_id
  LEFT JOIN funnel_data fd ON ut.id = fd.topic_id;
END;
$$;