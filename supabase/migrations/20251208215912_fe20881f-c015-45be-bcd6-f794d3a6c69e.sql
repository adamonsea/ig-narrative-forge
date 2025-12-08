-- Fix arrivals count to match what the UI actually shows
-- The UI filters by: processing_status IN ('new', 'extracted', 'validated')
-- But the RPC was using: ('new', 'processed') which is incorrect

CREATE OR REPLACE FUNCTION public.get_user_dashboard_stats(p_user_id uuid)
RETURNS TABLE(
  topic_id uuid,
  articles_in_arrivals bigint,
  stories_published_week bigint,
  visits_today bigint,
  visits_this_week bigint,
  play_mode_visits_week bigint,
  articles_liked bigint,
  articles_disliked bigint,
  share_clicks bigint,
  source_clicks bigint,
  quiz_responses_count bigint,
  installs_this_week bigint,
  installs_total bigint,
  registrants_this_week bigint,
  registrants_total bigint,
  avg_stories_engaged numeric,
  avg_carousel_swipes numeric,
  avg_final_slides_seen numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start date := CURRENT_DATE - 7;
  v_today date := CURRENT_DATE;
BEGIN
  RETURN QUERY
  WITH user_topics AS (
    SELECT t.id FROM topics t 
    WHERE t.created_by = p_user_id AND t.is_archived = false
  ),
  -- Arrivals count - must match UI filter: ('new', 'extracted', 'validated')
  arrivals AS (
    SELECT 
      ta.topic_id,
      COUNT(*) FILTER (
        WHERE ta.processing_status IN ('new', 'extracted', 'validated')
        AND NOT EXISTS (
          SELECT 1 FROM stories s WHERE s.topic_article_id = ta.id AND s.status IN ('ready', 'published')
        )
        AND NOT EXISTS (
          SELECT 1 FROM content_generation_queue cgq WHERE cgq.topic_article_id = ta.id AND cgq.status IN ('pending', 'processing')
        )
        AND (ta.import_metadata->>'source' IS DISTINCT FROM 'parliamentary_vote')
        AND (ta.import_metadata->>'parliamentary_vote' IS DISTINCT FROM 'true')
      ) as cnt
    FROM topic_articles ta
    WHERE ta.topic_id IN (SELECT id FROM user_topics)
    GROUP BY ta.topic_id
  ),
  -- Stories published this week
  stories_week AS (
    SELECT 
      ta.topic_id,
      COUNT(DISTINCT s.id) as cnt
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    WHERE ta.topic_id IN (SELECT id FROM user_topics)
      AND s.status IN ('ready', 'published')
      AND s.created_at >= v_week_start
    GROUP BY ta.topic_id
  ),
  -- Visitor stats
  visitor_stats AS (
    SELECT 
      fv.topic_id,
      COUNT(DISTINCT fv.visitor_id) FILTER (WHERE fv.visit_date = v_today AND (fv.page_type IS NULL OR fv.page_type = 'feed')) as today,
      COUNT(DISTINCT fv.visitor_id) FILTER (WHERE fv.visit_date >= v_week_start AND (fv.page_type IS NULL OR fv.page_type = 'feed')) as week,
      COUNT(DISTINCT fv.visitor_id) FILTER (WHERE fv.visit_date >= v_week_start AND fv.page_type = 'play') as play_week
    FROM feed_visits fv
    WHERE fv.topic_id IN (SELECT id FROM user_topics)
    GROUP BY fv.topic_id
  ),
  -- Swipe insights (likes/dislikes from Play Mode)
  swipe_stats AS (
    SELECT 
      ss.topic_id,
      COUNT(*) FILTER (WHERE ss.swipe_type = 'like') as likes,
      COUNT(*) FILTER (WHERE ss.swipe_type = 'discard') as dislikes
    FROM story_swipes ss
    WHERE ss.topic_id IN (SELECT id FROM user_topics)
    GROUP BY ss.topic_id
  ),
  -- Interaction stats (shares, source clicks)
  interaction_stats AS (
    SELECT 
      si.topic_id,
      COUNT(*) FILTER (WHERE si.interaction_type = 'share_click' AND si.created_at >= v_week_start) as shares,
      COUNT(*) FILTER (WHERE si.interaction_type = 'source_click' AND si.created_at >= v_week_start) as source_clicks
    FROM story_interactions si
    WHERE si.topic_id IN (SELECT id FROM user_topics)
    GROUP BY si.topic_id
  ),
  -- Quiz stats
  quiz_stats AS (
    SELECT 
      qq.topic_id,
      COUNT(qr.id) as responses
    FROM quiz_questions qq
    LEFT JOIN quiz_responses qr ON qr.question_id = qq.id AND qr.created_at >= v_week_start
    WHERE qq.topic_id IN (SELECT id FROM user_topics)
    GROUP BY qq.topic_id
  ),
  -- Install stats (PWA)
  install_stats AS (
    SELECT 
      tem.topic_id,
      COUNT(*) FILTER (WHERE tem.metric_type IN ('pwa_install_clicked', 'pwa_ios_instructions_viewed', 'pwa_installed') AND tem.created_at >= v_week_start) as week,
      COUNT(*) FILTER (WHERE tem.metric_type IN ('pwa_install_clicked', 'pwa_ios_instructions_viewed', 'pwa_installed')) as total
    FROM topic_engagement_metrics tem
    WHERE tem.topic_id IN (SELECT id FROM user_topics)
    GROUP BY tem.topic_id
  ),
  -- Registrant stats
  registrant_stats AS (
    SELECT 
      ss.topic_id,
      COUNT(DISTINCT ss.user_id) FILTER (WHERE ss.created_at >= v_week_start) as week,
      COUNT(DISTINCT ss.user_id) as total
    FROM story_swipes ss
    WHERE ss.topic_id IN (SELECT id FROM user_topics)
    GROUP BY ss.topic_id
  ),
  -- Engagement averages
  engagement_avgs AS (
    SELECT 
      si.topic_id,
      ROUND(AVG(stories_cnt), 1) as avg_engaged,
      ROUND(AVG(swipe_cnt), 1) as avg_swipes,
      ROUND(AVG(final_cnt), 1) as avg_final
    FROM (
      SELECT 
        si.topic_id,
        si.visitor_id,
        COUNT(DISTINCT si.story_id) FILTER (WHERE si.interaction_type = 'swipe') as stories_cnt,
        COUNT(*) FILTER (WHERE si.interaction_type = 'swipe') as swipe_cnt,
        0 as final_cnt
      FROM story_interactions si
      WHERE si.topic_id IN (SELECT id FROM user_topics)
        AND si.created_at >= v_week_start
      GROUP BY si.topic_id, si.visitor_id
    ) si
    GROUP BY si.topic_id
  )
  SELECT 
    ut.id as topic_id,
    COALESCE(a.cnt, 0)::bigint as articles_in_arrivals,
    COALESCE(sw.cnt, 0)::bigint as stories_published_week,
    COALESCE(vs.today, 0)::bigint as visits_today,
    COALESCE(vs.week, 0)::bigint as visits_this_week,
    COALESCE(vs.play_week, 0)::bigint as play_mode_visits_week,
    COALESCE(ss.likes, 0)::bigint as articles_liked,
    COALESCE(ss.dislikes, 0)::bigint as articles_disliked,
    COALESCE(ist.shares, 0)::bigint as share_clicks,
    COALESCE(ist.source_clicks, 0)::bigint as source_clicks,
    COALESCE(qs.responses, 0)::bigint as quiz_responses_count,
    COALESCE(ins.week, 0)::bigint as installs_this_week,
    COALESCE(ins.total, 0)::bigint as installs_total,
    COALESCE(rs.week, 0)::bigint as registrants_this_week,
    COALESCE(rs.total, 0)::bigint as registrants_total,
    COALESCE(ea.avg_engaged, 0)::numeric as avg_stories_engaged,
    COALESCE(ea.avg_swipes, 0)::numeric as avg_carousel_swipes,
    COALESCE(ea.avg_final, 0)::numeric as avg_final_slides_seen
  FROM user_topics ut
  LEFT JOIN arrivals a ON a.topic_id = ut.id
  LEFT JOIN stories_week sw ON sw.topic_id = ut.id
  LEFT JOIN visitor_stats vs ON vs.topic_id = ut.id
  LEFT JOIN swipe_stats ss ON ss.topic_id = ut.id
  LEFT JOIN interaction_stats ist ON ist.topic_id = ut.id
  LEFT JOIN quiz_stats qs ON qs.topic_id = ut.id
  LEFT JOIN install_stats ins ON ins.topic_id = ut.id
  LEFT JOIN registrant_stats rs ON rs.topic_id = ut.id
  LEFT JOIN engagement_avgs ea ON ea.topic_id = ut.id;
END;
$function$;