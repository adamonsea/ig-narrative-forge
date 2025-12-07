-- Create RPC function to get new vs returning visitor breakdown
CREATE OR REPLACE FUNCTION public.get_topic_visitor_breakdown(p_topic_id uuid, p_days integer DEFAULT 7)
RETURNS TABLE(
  today_new bigint,
  today_returning bigint,
  week_new bigint,
  week_returning bigint,
  total_unique bigint,
  return_rate_pct numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := CURRENT_DATE;
  v_week_start date := CURRENT_DATE - p_days;
BEGIN
  RETURN QUERY
  WITH 
  -- First visit ever for each visitor
  first_visits AS (
    SELECT visitor_id, MIN(visit_date) as first_visit_date
    FROM feed_visits
    WHERE topic_id = p_topic_id
    AND (page_type IS NULL OR page_type = 'feed')
    GROUP BY visitor_id
  ),
  -- Today's visitors classified
  today_visitors AS (
    SELECT 
      fv.visitor_id,
      CASE WHEN ff.first_visit_date = v_today THEN 'new' ELSE 'returning' END as visitor_type
    FROM feed_visits fv
    JOIN first_visits ff ON fv.visitor_id = ff.visitor_id
    WHERE fv.topic_id = p_topic_id
    AND fv.visit_date = v_today
    AND (fv.page_type IS NULL OR fv.page_type = 'feed')
  ),
  -- This week's visitors classified
  week_visitors AS (
    SELECT 
      fv.visitor_id,
      CASE WHEN ff.first_visit_date >= v_week_start THEN 'new' ELSE 'returning' END as visitor_type
    FROM feed_visits fv
    JOIN first_visits ff ON fv.visitor_id = ff.visitor_id
    WHERE fv.topic_id = p_topic_id
    AND fv.visit_date >= v_week_start
    AND (fv.page_type IS NULL OR fv.page_type = 'feed')
  ),
  -- All-time visitors who returned at least once
  returning_visitors AS (
    SELECT visitor_id
    FROM feed_visits
    WHERE topic_id = p_topic_id
    AND (page_type IS NULL OR page_type = 'feed')
    GROUP BY visitor_id
    HAVING COUNT(DISTINCT visit_date) > 1
  )
  SELECT
    COALESCE(COUNT(DISTINCT tv.visitor_id) FILTER (WHERE tv.visitor_type = 'new'), 0)::bigint as today_new,
    COALESCE(COUNT(DISTINCT tv.visitor_id) FILTER (WHERE tv.visitor_type = 'returning'), 0)::bigint as today_returning,
    COALESCE(COUNT(DISTINCT wv.visitor_id) FILTER (WHERE wv.visitor_type = 'new'), 0)::bigint as week_new,
    COALESCE(COUNT(DISTINCT wv.visitor_id) FILTER (WHERE wv.visitor_type = 'returning'), 0)::bigint as week_returning,
    (SELECT COUNT(DISTINCT visitor_id) FROM first_visits)::bigint as total_unique,
    CASE 
      WHEN (SELECT COUNT(*) FROM first_visits) > 0 
      THEN ROUND((SELECT COUNT(*)::numeric FROM returning_visitors) / (SELECT COUNT(*)::numeric FROM first_visits) * 100, 1)
      ELSE 0
    END as return_rate_pct
  FROM today_visitors tv
  FULL OUTER JOIN week_visitors wv ON true
  LIMIT 1;
END;
$function$;