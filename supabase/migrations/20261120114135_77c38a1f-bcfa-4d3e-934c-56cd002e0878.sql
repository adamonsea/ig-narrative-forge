CREATE OR REPLACE FUNCTION public.get_topic_readership(p_topic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start date := CURRENT_DATE - 6;
  v_prev_start date := CURRENT_DATE - 13;
  v_result jsonb;
  v_dropoff jsonb;
  v_feed_signal jsonb;
  v_engage jsonb;
  v_owner_email text;
  v_excl text[];
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN NULL; END IF;

  SELECT lower(u.email) INTO v_owner_email FROM topics t JOIN auth.users u ON u.id = t.created_by WHERE t.id = p_topic_id;

  SELECT COALESCE(array_agg(DISTINCT x.vid), ARRAY[]::text[]) INTO v_excl
    FROM topic_excluded_visitors(p_topic_id) x WHERE x.vid IS NOT NULL;

  WITH sess AS (
    SELECT regexp_replace(si.visitor_id, '^[a-z]+_', '') vid, si.impression_date, MAX(si.position) depth
    FROM story_impressions si
    WHERE si.topic_id = p_topic_id AND NOT si.is_internal AND si.position IS NOT NULL
      AND si.impression_date >= v_week_start AND NOT is_test_visitor(si.visitor_id)
      AND NOT (regexp_replace(si.visitor_id, '^[a-z]+_', '') = ANY(v_excl))
    GROUP BY 1, 2
  ), tot AS (SELECT COUNT(*) n, MAX(depth) deepest FROM sess)
  SELECT CASE WHEN tot.n >= 30 THEN jsonb_build_object(
      'sessions', tot.n,
      'reached', (SELECT jsonb_agg((SELECT COUNT(*) FROM sess WHERE sess.depth >= k) ORDER BY k)
                  FROM generate_series(0, LEAST(11, tot.deepest)) k))
    END INTO v_dropoff FROM tot;

  WITH imp AS (
    SELECT regexp_replace(si.visitor_id, '^[a-z]+_', '') vid, si.story_id, si.impression_date d, (si.max_dwell_ms >= 3000) stopped
    FROM story_impressions si
    WHERE si.topic_id = p_topic_id AND NOT si.is_internal AND si.impression_date >= v_week_start
      AND NOT is_test_visitor(si.visitor_id)
      AND NOT (regexp_replace(si.visitor_id, '^[a-z]+_', '') = ANY(v_excl))
  ), sw AS (
    SELECT DISTINCT regexp_replace(x.visitor_id, '^[a-z]+_', '') vid, x.story_id, x.created_at::date d
    FROM story_interactions x
    WHERE x.topic_id = p_topic_id AND x.interaction_type = 'swipe' AND NOT x.is_internal AND x.created_at >= v_week_start
  ), j AS (
    SELECT i.vid, i.stopped, (sw.vid IS NOT NULL) swiped FROM imp i
    LEFT JOIN sw ON sw.vid = i.vid AND sw.story_id = i.story_id AND sw.d = i.d
  )
  SELECT jsonb_build_object('readers', COUNT(DISTINCT vid), 'headlines', COUNT(*),
           'stop_rate', CASE WHEN COUNT(*) > 0 THEN round(AVG(stopped::int)::numeric, 4) END,
           'swipe_rate', CASE WHEN COUNT(*) > 0 THEN round(AVG(swiped::int)::numeric, 4) END)
    INTO v_feed_signal FROM j;

  -- Engagement: returning readers, per-story detail, clicks out, stories per visit, sign-ups, shares.
  WITH eng AS (
    SELECT DISTINCT e.vid, e.dy FROM topic_engagement(p_topic_id, v_week_start - 7) e
  ), ret AS (
    SELECT COUNT(DISTINCT a.vid) n FROM eng a
    WHERE a.dy >= v_week_start
      AND EXISTS (SELECT 1 FROM eng b WHERE b.vid = a.vid AND b.dy < a.dy AND b.dy >= a.dy - 7)
  ), act AS (
    SELECT DISTINCT regexp_replace(x.visitor_id, '^[a-z]+_', '') vid, x.story_id sid, x.created_at::date d, x.interaction_type k
    FROM story_interactions x
    WHERE x.topic_id = p_topic_id AND NOT x.is_internal AND x.created_at >= v_week_start
      AND x.interaction_type IN ('swipe', 'source_click', 'share_click', 'read_through')
      AND x.story_id IS NOT NULL AND NOT is_test_visitor(x.visitor_id)
      AND COALESCE(x.user_agent, '') <> 'test'
      AND NOT (regexp_replace(x.visitor_id, '^[a-z]+_', '') = ANY(v_excl))
  ), reads AS (
    SELECT r.sid, COUNT(*) n FROM topic_reads(p_topic_id, v_week_start) r GROUP BY r.sid
  ), sc AS (
    SELECT * FROM story_stop_scores(p_topic_id, v_week_start)
  ), per AS (
    SELECT sid,
           COUNT(DISTINCT vid) FILTER (WHERE k = 'swipe') opened,
           COUNT(DISTINCT vid) FILTER (WHERE k = 'read_through') read_through,
           COUNT(*) FILTER (WHERE k = 'source_click') source_clicks,
           COUNT(*) FILTER (WHERE k = 'share_click') shares
    FROM act GROUP BY sid
  ), cand AS (
    (SELECT sid FROM reads ORDER BY n DESC LIMIT 10)
    UNION (SELECT story_id FROM sc WHERE qualifies ORDER BY score DESC LIMIT 5)
    UNION (SELECT sid FROM per WHERE source_clicks > 0 ORDER BY source_clicks DESC LIMIT 5)
  ), stories_j AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', s.id, 'title', s.title, 'image', s.cover_illustration_url,
             'reads', COALESCE(r.n, 0), 'seen', COALESCE(q.seen, 0),
             'stop_rate', CASE WHEN q.qualifies THEN q.stop_rate END,
             'score', CASE WHEN q.qualifies THEN q.score END,
             'opened', COALESCE(p.opened, 0), 'read_through', COALESCE(p.read_through, 0),
             'source_clicks', COALESCE(p.source_clicks, 0), 'shares', COALESCE(p.shares, 0))
             ORDER BY COALESCE(r.n, 0) DESC), '[]'::jsonb) j
    FROM cand c JOIN stories s ON s.id = c.sid
    LEFT JOIN reads r ON r.sid = c.sid
    LEFT JOIN sc q ON q.story_id = c.sid
    LEFT JOIN per p ON p.sid = c.sid
  ), ev AS (
    SELECT ec.kind, COUNT(*) n FROM event_clicks ec
    WHERE ec.topic_id = p_topic_id AND ec.click_date >= v_week_start
      AND NOT is_test_visitor(ec.visitor_id)
      AND NOT (regexp_replace(ec.visitor_id, '^[a-z]+_', '') = ANY(v_excl))
    GROUP BY ec.kind
  ), visits AS (
    SELECT COUNT(DISTINCT si.story_id) n
    FROM story_impressions si
    WHERE si.topic_id = p_topic_id AND NOT si.is_internal AND si.impression_date >= v_week_start
      AND NOT is_test_visitor(si.visitor_id)
      AND NOT (regexp_replace(si.visitor_id, '^[a-z]+_', '') = ANY(v_excl))
    GROUP BY regexp_replace(si.visitor_id, '^[a-z]+_', ''), si.impression_date
  ), signups AS (
    SELECT COUNT(*) n FROM topic_newsletter_signups t
    WHERE t.topic_id = p_topic_id AND t.is_active AND t.created_at >= v_week_start
      AND (t.email_verified OR t.push_subscription IS NOT NULL)
      AND (v_owner_email IS NULL OR t.email IS NULL OR lower(t.email) <> v_owner_email)
  )
  SELECT jsonb_build_object(
    'returning_week', (SELECT n FROM ret),
    'stories', (SELECT j FROM stories_j),
    'sent', jsonb_build_object(
      'stories', (SELECT COUNT(*) FROM act WHERE k = 'source_click'),
      'tickets', COALESCE((SELECT n FROM ev WHERE kind = 'tickets'), 0),
      'details', COALESCE((SELECT n FROM ev WHERE kind = 'details'), 0),
      'calendar', COALESCE((SELECT n FROM ev WHERE kind = 'calendar'), 0)),
    'feed', jsonb_build_object(
      'visits', (SELECT COUNT(*) FROM visits),
      'seen_per_visit', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n) FROM visits),
      'signups', (SELECT n FROM signups),
      'shares', (SELECT COUNT(*) FROM act WHERE k = 'share_click'))
  ) INTO v_engage;

  WITH reads AS (
    SELECT r.vid AS visitor_id, r.sid AS story_id, r.dy AS day FROM topic_reads(p_topic_id, v_prev_start) r
  ), days AS (
    SELECT d::date AS day, (SELECT COUNT(*) FROM reads WHERE reads.day = d::date) n
    FROM generate_series(v_week_start, CURRENT_DATE, interval '1 day') d
  )
  SELECT jsonb_build_object(
    'reads_week', (SELECT COUNT(*) FROM reads WHERE day >= v_week_start),
    'reads_prev_week', (SELECT COUNT(*) FROM reads WHERE day < v_week_start),
    'readers_week', count_topic_readers(p_topic_id, v_week_start),
    'daily', (SELECT jsonb_agg(jsonb_build_object('day', day, 'reads', n) ORDER BY day) FROM days),
    'dropoff', v_dropoff,
    'feed_signal', v_feed_signal,
    'event_clicks_week', COALESCE((v_engage->'sent'->>'tickets')::int + (v_engage->'sent'->>'details')::int, 0)
  ) || v_engage INTO v_result;

  RETURN v_result;
END;
$function$;