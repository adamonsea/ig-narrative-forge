-- One source of truth for reader figures. Days are Europe/London days.
CREATE OR REPLACE FUNCTION public.london_today() RETURNS date LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ SELECT (now() AT TIME ZONE 'Europe/London')::date $$;
GRANT EXECUTE ON FUNCTION public.london_today() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.topic_engagement(p_topic_id uuid, p_from date, p_to date DEFAULT public.london_today(), p_with_pauses boolean DEFAULT true, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(vid text, sid uuid, dy date, signal text)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH sig AS (
    SELECT x.visitor_id AS raw, x.story_id AS s, (x.created_at AT TIME ZONE 'Europe/London')::date AS d, x.interaction_type AS k
    FROM story_interactions x
    WHERE x.topic_id = p_topic_id AND x.interaction_type IN ('swipe', 'page_dwell') AND NOT x.is_internal
      AND x.created_at >= (p_from::timestamp AT TIME ZONE 'Europe/London')
      AND x.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Europe/London')
      AND x.created_at >= COALESCE(p_since, '-infinity'::timestamptz)
    UNION ALL
    SELECT i.visitor_id, i.story_id, i.impression_date, 'pause'
    FROM story_impressions i
    WHERE p_with_pauses AND i.topic_id = p_topic_id AND NOT i.is_internal AND i.max_dwell_ms >= 3000
      AND i.impression_date BETWEEN p_from AND p_to
      AND COALESCE(i.last_seen_at, i.created_at) >= COALESCE(p_since, '-infinity'::timestamptz)
  )
  SELECT DISTINCT regexp_replace(g.raw, '^[a-z]+_', ''), g.s, g.d, g.k FROM sig g
  WHERE NOT is_test_visitor(g.raw)
    AND regexp_replace(g.raw, '^[a-z]+_', '') NOT IN (SELECT e.vid FROM topic_excluded_visitors(p_topic_id) e)
$function$;

CREATE OR REPLACE FUNCTION public.topic_reads(p_topic_id uuid, p_from date, p_to date DEFAULT public.london_today())
 RETURNS TABLE(vid text, sid uuid, dy date) LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT DISTINCT e.vid, e.sid, e.dy FROM topic_engagement(p_topic_id, p_from, p_to, true) e WHERE e.sid IS NOT NULL
$function$;

CREATE OR REPLACE FUNCTION public.topic_reader_metrics(p_topic_id uuid, p_from date, p_to date DEFAULT public.london_today())
 RETURNS TABLE(readers bigint, reads bigint, signups bigint, shares bigint, sent_to_sources bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH eng AS (SELECT * FROM topic_engagement(p_topic_id, p_from, p_to)),
  excl AS (SELECT e.vid FROM topic_excluded_visitors(p_topic_id) e),
  act AS (
    SELECT x.interaction_type k FROM story_interactions x
    WHERE x.topic_id = p_topic_id AND NOT x.is_internal AND x.interaction_type IN ('source_click','share_click')
      AND x.story_id IS NOT NULL AND NOT is_test_visitor(x.visitor_id) AND COALESCE(x.user_agent,'') <> 'test'
      AND x.created_at >= (p_from::timestamp AT TIME ZONE 'Europe/London')
      AND x.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Europe/London')
      AND regexp_replace(x.visitor_id, '^[a-z]+_', '') NOT IN (SELECT vid FROM excl)
  ),
  owner AS (SELECT lower(u.email) em FROM topics t JOIN auth.users u ON u.id = t.created_by WHERE t.id = p_topic_id)
  SELECT
    (SELECT COUNT(DISTINCT vid) FROM eng)::bigint,
    (SELECT COUNT(*) FROM (SELECT DISTINCT vid, sid, dy FROM eng WHERE sid IS NOT NULL) r)::bigint,
    (SELECT COUNT(*) FROM topic_newsletter_signups s
       WHERE s.topic_id = p_topic_id AND s.is_active
         AND s.created_at >= (p_from::timestamp AT TIME ZONE 'Europe/London')
         AND s.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Europe/London')
         AND (s.email_verified OR s.push_subscription IS NOT NULL)
         AND (s.email IS NULL OR lower(s.email) IS DISTINCT FROM (SELECT em FROM owner)))::bigint,
    (SELECT COUNT(*) FROM act WHERE k = 'share_click')::bigint,
    (SELECT COUNT(*) FROM act WHERE k = 'source_click')::bigint
$function$;
REVOKE ALL ON FUNCTION public.topic_reader_metrics(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topic_reader_metrics(uuid, date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.count_topic_readers(p_topic_id uuid, p_from date, p_to date DEFAULT public.london_today())
 RETURNS bigint LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$ SELECT m.readers FROM topic_reader_metrics(p_topic_id, p_from, p_to) m $function$;

CREATE OR REPLACE FUNCTION public.topic_reading_now(p_topic_id uuid)
 RETURNS bigint LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT COUNT(DISTINCT e.vid)::bigint
  FROM topic_engagement(p_topic_id, public.london_today() - 1, public.london_today(), true, now() - interval '5 minutes') e
$function$;

CREATE OR REPLACE FUNCTION public.get_topic_live_readers(p_topic_id uuid)
 RETURNS TABLE(readers_last_hour bigint, readers_today bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY SELECT
    (SELECT COUNT(DISTINCT e.vid) FROM topic_engagement(p_topic_id, public.london_today() - 1, public.london_today(), true, now() - interval '1 hour') e)::bigint,
    count_topic_readers(p_topic_id, public.london_today(), public.london_today());
END $function$;

CREATE OR REPLACE FUNCTION public.get_widget_social_proof(p_topic_id uuid, p_story_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE((select auth.role()), '') <> 'service_role' THEN RETURN NULL; END IF;
  RETURN (
    WITH r AS (SELECT * FROM topic_reads(p_topic_id, public.london_today() - 6) WHERE sid = ANY(p_story_ids)),
    recent AS (SELECT e.vid, e.sid FROM topic_engagement(p_topic_id, public.london_today() - 1, public.london_today(), true, now() - interval '3 hours') e
               WHERE e.sid = ANY(p_story_ids))
    SELECT jsonb_build_object(
      'readers_all_time', count_topic_readers(p_topic_id, DATE '2000-01-01'),
      'story_reads', COALESCE((SELECT jsonb_object_agg(sid, n) FROM (SELECT sid, COUNT(*) n FROM r GROUP BY sid) s), '{}'::jsonb),
      'stop_scores', COALESCE((SELECT jsonb_object_agg(x.story_id, x.score) FROM story_stop_scores(p_topic_id, public.london_today() - 6) x
                                WHERE x.qualifies AND x.story_id = ANY(p_story_ids)), '{}'::jsonb),
      'trending_story_id', (SELECT sid FROM recent GROUP BY sid HAVING COUNT(DISTINCT vid) >= 3 ORDER BY COUNT(DISTINCT vid) DESC, sid LIMIT 1)
    )
  );
END; $function$;

CREATE OR REPLACE FUNCTION public.get_topic_readership(p_topic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start date := public.london_today() - 6;
  v_prev_start date := public.london_today() - 13;
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
    WHERE x.topic_id = p_topic_id AND x.interaction_type = 'swipe' AND NOT x.is_internal AND x.created_at >= (v_week_start::timestamp AT TIME ZONE 'Europe/London')
  ), j AS (
    SELECT i.vid, i.stopped, (sw.vid IS NOT NULL) swiped FROM imp i
    LEFT JOIN sw ON sw.vid = i.vid AND sw.story_id = i.story_id AND sw.d = i.d
  )
  SELECT jsonb_build_object('readers', COUNT(DISTINCT vid), 'headlines', COUNT(*),
           'stop_rate', CASE WHEN COUNT(*) > 0 THEN round(AVG(stopped::int)::numeric, 4) END,
           'swipe_rate', CASE WHEN COUNT(*) > 0 THEN round(AVG(swiped::int)::numeric, 4) END)
    INTO v_feed_signal FROM j;

  WITH eng AS (
    SELECT DISTINCT e.vid, e.dy FROM topic_engagement(p_topic_id, v_week_start - 7) e
  ), ret AS (
    SELECT COUNT(DISTINCT a.vid) n FROM eng a
    WHERE a.dy >= v_week_start
      AND EXISTS (SELECT 1 FROM eng b WHERE b.vid = a.vid AND b.dy < a.dy AND b.dy >= a.dy - 7)
  ), act AS (
    SELECT DISTINCT regexp_replace(x.visitor_id, '^[a-z]+_', '') vid, x.story_id sid, x.created_at::date d, x.interaction_type k
    FROM story_interactions x
    WHERE x.topic_id = p_topic_id AND NOT x.is_internal AND x.created_at >= (v_week_start::timestamp AT TIME ZONE 'Europe/London')
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
  ), m AS (
    SELECT * FROM topic_reader_metrics(p_topic_id, v_week_start)
  )
  SELECT jsonb_build_object(
    'returning_week', (SELECT n FROM ret),
    'stories', (SELECT j FROM stories_j),
    'sent', jsonb_build_object(
      'stories', (SELECT m.sent_to_sources FROM m),
      'tickets', COALESCE((SELECT n FROM ev WHERE kind = 'tickets'), 0),
      'details', COALESCE((SELECT n FROM ev WHERE kind = 'details'), 0),
      'calendar', COALESCE((SELECT n FROM ev WHERE kind = 'calendar'), 0)),
    'feed', jsonb_build_object(
      'visits', (SELECT COUNT(*) FROM visits),
      'seen_per_visit', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n) FROM visits),
      'signups', (SELECT m.signups FROM m),
      'shares', (SELECT m.shares FROM m))
  ) INTO v_engage;

  WITH reads AS (
    SELECT r.vid AS visitor_id, r.sid AS story_id, r.dy AS day FROM topic_reads(p_topic_id, v_prev_start) r
  ), days AS (
    SELECT d::date AS day, (SELECT COUNT(*) FROM reads WHERE reads.day = d::date) n
    FROM generate_series(v_week_start, public.london_today(), interval '1 day') d
  )
  SELECT jsonb_build_object(
    'reads_week', (SELECT COUNT(*) FROM reads WHERE day >= v_week_start),
    'reads_prev_week', (SELECT COUNT(*) FROM reads WHERE day < v_week_start),
    'readers_week', (SELECT m.readers FROM topic_reader_metrics(p_topic_id, v_week_start) m),
    'readers_prev_week', (SELECT m.readers FROM topic_reader_metrics(p_topic_id, v_prev_start, v_week_start - 1) m),
    'daily', (SELECT jsonb_agg(jsonb_build_object('day', day, 'reads', n) ORDER BY day) FROM days),
    'dropoff', v_dropoff,
    'feed_signal', v_feed_signal,
    'event_clicks_week', COALESCE((v_engage->'sent'->>'tickets')::int + (v_engage->'sent'->>'details')::int, 0)
  ) || v_engage INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_feed_cards(p_user_id uuid)
 RETURNS TABLE(topic_id uuid, reading_now bigint, reads_week bigint, reads_prev_week bigint, reads_daily integer[], first_read_date date, top_story_id uuid, top_story_title text, top_story_image text, top_story_reads bigint, subscribers_total bigint, subscribers_week bigint, email_subscribers bigint, push_subscribers bigint, registrants_total bigint, installs_total bigint, published_week bigint, sources_count bigint, arrivals_count bigint, readers_today bigint, readers_week bigint, readers_prev_week bigint, weekly_reads integer[], best_prior_day bigint, best_day_date date, best_day_reads bigint, median_story_reads numeric, reads_total bigint, published_total bigint, new_referrer text, new_referrer_readers bigint, return_rate_week numeric, return_rate_prev numeric, loyal_reader_days bigint, new_country text, new_country_readers bigint, top_weekday integer, top_weekday_share numeric, search_impressions_week bigint, search_clicks_week bigint, search_impressions_prev bigint, search_impressions_total bigint, search_weeks integer, search_best_prior_week bigint, top_search_story_id uuid, top_search_story_title text, top_search_story_clicks bigint, top_query text, top_stop_story_id uuid, top_stop_story_title text, top_stop_rate numeric, top_stop_seen bigint, median_stop_rate numeric, stop_qualifying_stories integer, reads_month bigint, readers_month bigint, published_month bigint, reads_daily_month integer[], visits_week bigint, visits_month bigint, readers_weekly integer[], returning_week bigint, visits_daily integer[], readers_daily integer[], top_sources jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t record; d record;
  v_week_start date := public.london_today() - 6; v_prev_start date := public.london_today() - 13;
  v_month_start date := public.london_today() - 29;
  v_excl text := '(curatr\.pro|lovable\.app|lovableproject\.com|google\.|bing\.|duckduckgo\.|android\.gm)';
BEGIN
  IF NOT can_view_user_stats(p_user_id) THEN RETURN; END IF;

  FOR t IN SELECT tp.id FROM topics tp WHERE tp.created_by = p_user_id AND tp.is_archived = false LOOP
    IF NOT can_view_topic_stats(t.id) THEN CONTINUE; END IF;
    topic_id := t.id;

    CREATE TEMP TABLE IF NOT EXISTS _reads(visitor_id text, story_id uuid, day date) ON COMMIT DROP;
    TRUNCATE _reads;
    INSERT INTO _reads SELECT r.vid, r.sid, r.dy FROM topic_reads(t.id, DATE '2000-01-01') r;

    CREATE TEMP TABLE IF NOT EXISTS _eng(vid text, dy date) ON COMMIT DROP;
    TRUNCATE _eng;
    INSERT INTO _eng SELECT DISTINCT e.vid, e.dy FROM topic_engagement(t.id, public.london_today() - 120) e;

    CREATE TEMP TABLE IF NOT EXISTS _excl(vid text) ON COMMIT DROP;
    TRUNCATE _excl;
    INSERT INTO _excl SELECT DISTINCT x.vid FROM topic_excluded_visitors(t.id) x WHERE x.vid IS NOT NULL;

    SELECT COUNT(*) FILTER (WHERE day >= v_week_start), COUNT(*) FILTER (WHERE day BETWEEN v_prev_start AND v_week_start - 1), MIN(day), COUNT(*)
      INTO reads_week, reads_prev_week, first_read_date, reads_total FROM _reads;
    reads_month := (SELECT COUNT(*) FROM _reads WHERE day >= v_month_start);
    SELECT array_agg(COALESCE(c.n,0)::int ORDER BY g.day) INTO reads_daily
      FROM generate_series(v_week_start, public.london_today(), interval '1 day') g(day)
      LEFT JOIN (SELECT day, COUNT(*) n FROM _reads GROUP BY day) c ON c.day = g.day::date;
    SELECT array_agg(COALESCE(c.n,0)::int ORDER BY g.day) INTO reads_daily_month
      FROM generate_series(v_month_start, public.london_today(), interval '1 day') g(day)
      LEFT JOIN (SELECT day, COUNT(*) n FROM _reads GROUP BY day) c ON c.day = g.day::date;
    SELECT array_agg(COALESCE(c.n,0)::int ORDER BY w DESC) INTO weekly_reads
      FROM generate_series(0,7) w
      LEFT JOIN LATERAL (SELECT COUNT(*) n FROM _reads r WHERE r.day BETWEEN v_week_start - 7*w AND v_week_start - 7*w + 6) c ON true;
    SELECT MAX(n) INTO best_prior_day FROM (SELECT COUNT(*) n FROM _reads WHERE day < public.london_today() - 1 GROUP BY day) z;
    SELECT day, n INTO best_day_date, best_day_reads FROM (SELECT day, COUNT(*) n FROM _reads WHERE day >= public.london_today() - 1 GROUP BY day) z ORDER BY n DESC LIMIT 1;
    IF NOT FOUND THEN best_day_date := NULL; best_day_reads := 0; END IF;

    SELECT s.id, s.title, s.cover_illustration_url, x.n INTO top_story_id, top_story_title, top_story_image, top_story_reads
      FROM (SELECT story_id, COUNT(*) n FROM _reads WHERE day >= v_week_start GROUP BY story_id ORDER BY n DESC LIMIT 1) x
      JOIN stories s ON s.id = x.story_id;
    IF NOT FOUND THEN top_story_id := NULL; top_story_title := NULL; top_story_image := NULL; top_story_reads := NULL; END IF;
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n) INTO median_story_reads
      FROM (SELECT COUNT(*) n FROM _reads WHERE day >= public.london_today() - 27 GROUP BY story_id) z;

    readers_today := (SELECT COUNT(DISTINCT e.vid) FROM _eng e WHERE e.dy = public.london_today());
    readers_week := (SELECT m.readers FROM topic_reader_metrics(t.id, v_week_start) m);
    readers_prev_week := (SELECT COUNT(DISTINCT e.vid) FROM _eng e WHERE e.dy BETWEEN v_prev_start AND v_week_start - 1);
    readers_month := (SELECT COUNT(DISTINCT e.vid) FROM _eng e WHERE e.dy >= v_month_start);
    SELECT array_agg(c.n::int ORDER BY w DESC) INTO readers_weekly
      FROM generate_series(0,7) w
      LEFT JOIN LATERAL (SELECT COUNT(DISTINCT e.vid) n FROM _eng e WHERE e.dy BETWEEN v_week_start - 7*w AND v_week_start - 7*w + 6) c ON true;
    returning_week := (SELECT COUNT(DISTINCT a.vid) FROM _eng a WHERE a.dy >= v_week_start
                         AND EXISTS (SELECT 1 FROM _eng b WHERE b.vid = a.vid AND b.dy < v_week_start));
    SELECT array_agg(COALESCE(c.n,0)::int ORDER BY g.day) INTO readers_daily
      FROM generate_series(public.london_today() - 13, public.london_today(), interval '1 day') g(day)
      LEFT JOIN (SELECT e.dy, COUNT(DISTINCT e.vid) n FROM _eng e GROUP BY e.dy) c ON c.dy = g.day::date;
    SELECT array_agg(count_topic_visitors(t.id, g.day::date, g.day::date)::int ORDER BY g.day) INTO visits_daily
      FROM generate_series(public.london_today() - 13, public.london_today(), interval '1 day') g(day);
    visits_week := count_topic_visitors(t.id, v_week_start);
    visits_month := count_topic_visitors(t.id, v_month_start);

    reading_now := topic_reading_now(t.id);

    WITH ref AS (
      SELECT regexp_replace(sv.visitor_id, '^[a-z]+_', '') vid,
             regexp_replace(lower(substring(sv.referrer from '^https?://([^/:?#]+)')), '^(www\.|m\.)', '') h
        FROM site_visits sv WHERE sv.topic_id = t.id AND NOT sv.is_internal AND sv.visit_date >= public.london_today() - 13 AND sv.referrer IS NOT NULL
      UNION
      SELECT regexp_replace(x.visitor_id, '^[a-z]+_', ''),
             regexp_replace(lower(substring(x.referrer from '^https?://([^/:?#]+)')), '^(www\.|m\.)', '')
        FROM story_interactions x WHERE x.topic_id = t.id AND NOT x.is_internal AND x.created_at >= ((public.london_today() - 13)::timestamp AT TIME ZONE 'Europe/London') AND x.referrer IS NOT NULL
    ), agg AS (
      SELECT r.h, COUNT(DISTINCT r.vid) visitors,
             COUNT(DISTINCT r.vid) FILTER (WHERE r.vid IN (SELECT e.vid FROM _eng e WHERE e.dy >= public.london_today() - 13)) readers
        FROM ref r
       WHERE r.h IS NOT NULL AND r.h <> '' AND r.h !~ '(curatr\.pro|lovable\.app|lovableproject\.com|lovable\.dev)'
         AND NOT is_test_visitor(r.vid) AND r.vid NOT IN (SELECT x.vid FROM _excl x)
       GROUP BY r.h
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('host', h, 'visitors', visitors, 'readers', readers) ORDER BY readers DESC, visitors DESC), '[]'::jsonb)
      INTO top_sources FROM (SELECT * FROM agg WHERE readers > 0 ORDER BY readers DESC, visitors DESC LIMIT 3) z;

    SELECT
      (SELECT CASE WHEN COUNT(DISTINCT a.vid)=0 THEN NULL ELSE COUNT(DISTINCT a.vid) FILTER (WHERE EXISTS (SELECT 1 FROM _eng b WHERE b.vid=a.vid AND b.dy < a.dy))::numeric / COUNT(DISTINCT a.vid) END FROM _eng a WHERE a.dy >= v_week_start),
      (SELECT CASE WHEN COUNT(DISTINCT a.vid)=0 THEN NULL ELSE COUNT(DISTINCT a.vid) FILTER (WHERE EXISTS (SELECT 1 FROM _eng b WHERE b.vid=a.vid AND b.dy < a.dy))::numeric / COUNT(DISTINCT a.vid) END FROM _eng a WHERE a.dy BETWEEN v_prev_start AND v_week_start - 1),
      (SELECT MAX(c) FROM (SELECT COUNT(*) c FROM _eng GROUP BY _eng.vid) z)
    INTO return_rate_week, return_rate_prev, loyal_reader_days;

    new_referrer := NULL; new_referrer_readers := 0;
    SELECT h, n INTO new_referrer, new_referrer_readers FROM (
      SELECT regexp_replace(substring(sv.referrer from '^https?://([^/]+)'), '^www\.', '') h,
             COUNT(DISTINCT regexp_replace(sv.visitor_id, '^[a-z]+_', '')) FILTER (WHERE sv.visit_date >= v_week_start) n,
             COUNT(*) FILTER (WHERE sv.visit_date BETWEEN v_week_start - 28 AND v_week_start - 1) prior
      FROM site_visits sv WHERE sv.topic_id = t.id AND NOT sv.is_internal AND sv.visit_date >= v_week_start - 28 AND sv.referrer IS NOT NULL
        AND regexp_replace(sv.visitor_id, '^[a-z]+_', '') IN (SELECT e.vid FROM _eng e)
      GROUP BY 1) q
    WHERE h IS NOT NULL AND h !~ v_excl AND prior = 0 AND n > 0 ORDER BY n DESC LIMIT 1;

    new_country := NULL; new_country_readers := 0;
    SELECT country_code, n INTO new_country, new_country_readers FROM (
      SELECT sv.country_code, COUNT(DISTINCT regexp_replace(sv.visitor_id, '^[a-z]+_', '')) n, MIN(sv.visit_date) first_seen
      FROM site_visits sv WHERE sv.topic_id = t.id AND NOT sv.is_internal AND sv.country_code IS NOT NULL AND sv.country_code <> ''
        AND regexp_replace(sv.visitor_id, '^[a-z]+_', '') IN (SELECT e.vid FROM _eng e)
      GROUP BY 1) q
    WHERE first_seen >= v_week_start AND EXISTS (SELECT 1 FROM site_visits s2 WHERE s2.topic_id = t.id AND NOT s2.is_internal AND s2.visit_date < v_week_start)
    ORDER BY n DESC LIMIT 1;

    top_weekday := NULL; top_weekday_share := NULL;
    SELECT dow, share INTO top_weekday, top_weekday_share FROM (
      SELECT EXTRACT(DOW FROM day)::int dow, COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (),0) share, SUM(COUNT(*)) OVER () total
      FROM _reads WHERE day >= public.london_today() - 27 GROUP BY 1) z
    WHERE total >= 50 ORDER BY share DESC LIMIT 1;

    SELECT COUNT(*) FILTER (WHERE push_subscription IS NULL), COUNT(*) FILTER (WHERE push_subscription IS NOT NULL),
           COUNT(*) FILTER (WHERE created_at >= v_week_start)
      INTO email_subscribers, push_subscribers, subscribers_week
      FROM topic_newsletter_signups WHERE topic_newsletter_signups.topic_id = t.id AND is_active;

    SELECT * INTO d FROM _impl_user_dashboard_stats(p_user_id) x WHERE x.topic_id = t.id;
    registrants_total := COALESCE(d.registrants_total, 0);
    installs_total := COALESCE(d.installs_total, 0);
    published_week := COALESCE(d.stories_published_week, 0);
    arrivals_count := COALESCE(d.articles_in_arrivals, 0);
    subscribers_total := email_subscribers + push_subscribers + registrants_total + installs_total;
    subscribers_week := subscribers_week + COALESCE(d.registrants_this_week,0) + COALESCE(d.installs_this_week,0);
    SELECT COUNT(*) INTO sources_count FROM content_sources cs WHERE cs.topic_id = t.id AND cs.is_active;
    SELECT COUNT(*) INTO published_total FROM stories s JOIN topic_articles ta ON ta.id = s.topic_article_id
      WHERE ta.topic_id = t.id AND s.is_published;
    SELECT COUNT(*) INTO published_month FROM stories s JOIN topic_articles ta ON ta.id = s.topic_article_id
      WHERE ta.topic_id = t.id AND s.is_published AND s.published_at >= v_month_start;

    SELECT COALESCE(SUM(impressions) FILTER (WHERE day BETWEEN public.london_today() - 9 AND public.london_today() - 3),0),
           COALESCE(SUM(clicks) FILTER (WHERE day BETWEEN public.london_today() - 9 AND public.london_today() - 3),0),
           COALESCE(SUM(impressions) FILTER (WHERE day BETWEEN public.london_today() - 16 AND public.london_today() - 10),0),
           COALESCE(SUM(impressions) FILTER (WHERE day <= public.london_today() - 3),0),
           COALESCE(((public.london_today() - 3) - MIN(day)) / 7 + 1, 0)::int
      INTO search_impressions_week, search_clicks_week, search_impressions_prev, search_impressions_total, search_weeks
      FROM search_daily sd WHERE sd.topic_id = t.id;
    SELECT MAX(n) INTO search_best_prior_week FROM (
      SELECT ((public.london_today() - 3) - day) / 7 AS b, SUM(impressions) n FROM search_daily sd
      WHERE sd.topic_id = t.id AND day <= public.london_today() - 10 GROUP BY 1) z;
    SELECT s.id, s.title, x.c INTO top_search_story_id, top_search_story_title, top_search_story_clicks
      FROM (SELECT story_id, SUM(clicks) c FROM search_daily sd WHERE sd.topic_id = t.id AND story_id IS NOT NULL
            AND day BETWEEN public.london_today() - 9 AND public.london_today() - 3 GROUP BY story_id ORDER BY c DESC LIMIT 1) x
      JOIN stories s ON s.id = x.story_id;
    IF NOT FOUND THEN top_search_story_id := NULL; top_search_story_title := NULL; top_search_story_clicks := NULL; END IF;
    SELECT sd.top_query INTO top_query FROM search_daily sd WHERE sd.topic_id = t.id AND sd.top_query IS NOT NULL
      AND day BETWEEN public.london_today() - 9 AND public.london_today() - 3 ORDER BY sd.clicks DESC, sd.impressions DESC LIMIT 1;
    IF NOT FOUND THEN top_query := NULL; END IF;

    SELECT s.id, s.title, x.stop_rate, x.seen, x.expected_rate, x.n_q
      INTO top_stop_story_id, top_stop_story_title, top_stop_rate, top_stop_seen, median_stop_rate, stop_qualifying_stories
      FROM (SELECT y.*, (COUNT(*) OVER ())::int n_q FROM story_stop_scores(t.id, v_week_start) y WHERE y.qualifies) x
      JOIN stories s ON s.id = x.story_id ORDER BY x.score DESC, x.seen DESC LIMIT 1;
    IF NOT FOUND THEN top_stop_story_id := NULL; top_stop_story_title := NULL; top_stop_rate := NULL; top_stop_seen := NULL;
      median_stop_rate := NULL; stop_qualifying_stories := 0; END IF;

    RETURN NEXT;
  END LOOP;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_topic_pulse(p_topic_id uuid, p_story_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_state record; v_result jsonb;
  v_today int; v_best_other int; v_readers_all bigint;
  v_d date := public.london_today();
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN NULL; END IF;
  SELECT * INTO v_state FROM curator_topic_state WHERE user_id = auth.uid() AND topic_id = p_topic_id;

  CREATE TEMP TABLE IF NOT EXISTS _pulse_r (vid text, sid uuid, dy date) ON COMMIT DROP;
  TRUNCATE _pulse_r;
  INSERT INTO _pulse_r SELECT r.vid, r.sid, r.dy FROM topic_reads(p_topic_id, v_d - 29) r;

  CREATE TEMP TABLE IF NOT EXISTS _pulse_3h (vid text, sid uuid, recent boolean) ON COMMIT DROP;
  TRUNCATE _pulse_3h;
  INSERT INTO _pulse_3h
  SELECT e.vid, e.sid, false FROM topic_engagement(p_topic_id, v_d - 1, v_d, true, now() - interval '3 hours') e WHERE e.sid IS NOT NULL
  UNION
  SELECT e.vid, e.sid, true FROM topic_engagement(p_topic_id, v_d - 1, v_d, true, now() - interval '5 minutes') e WHERE e.sid IS NOT NULL;

  SELECT COUNT(*) INTO v_today FROM _pulse_r WHERE dy = v_d;
  SELECT COALESCE(MAX(n),0) INTO v_best_other FROM (SELECT COUNT(*) n FROM _pulse_r WHERE dy < v_d GROUP BY dy) d;
  v_readers_all := count_topic_readers(p_topic_id, DATE '2000-01-01');

  SELECT jsonb_build_object(
    'reading_now', topic_reading_now(p_topic_id),
    'reading_now_story_ids', COALESCE((SELECT jsonb_agg(DISTINCT sid) FROM _pulse_3h WHERE recent AND sid = ANY(p_story_ids)), '[]'::jsonb),
    'story_reads', COALESCE((SELECT jsonb_object_agg(sid, n) FROM (
        SELECT sid, COUNT(*) n FROM _pulse_r WHERE dy >= v_d - 6 AND sid = ANY(p_story_ids) GROUP BY sid) s), '{}'::jsonb),
    'rising_story_id', (SELECT sid FROM _pulse_3h GROUP BY sid HAVING COUNT(DISTINCT vid) >= 3 ORDER BY COUNT(DISTINCT vid) DESC, sid LIMIT 1),
    'last_looked_at', v_state.desk_last_looked_at,
    'new_arrivals', CASE WHEN v_state.desk_last_looked_at IS NULL THEN 0 ELSE
        (SELECT COUNT(*) FROM topic_articles WHERE topic_id = p_topic_id AND processing_status = 'new'
           AND created_at > v_state.desk_last_looked_at) END,
    'readers_all_time', v_readers_all,
    'reads_today', v_today,
    'best_other_day_30', v_best_other,
    'dismissed', to_jsonb(COALESCE(v_state.dismissed_milestones, '{}'::text[]))
  ) INTO v_result;
  RETURN v_result;
END; $function$;

DROP FUNCTION IF EXISTS public.get_topic_engagement_funnel(uuid);
DROP FUNCTION IF EXISTS public.get_topic_engagement_funnel(uuid, integer);

CREATE OR REPLACE FUNCTION public.admin_reader_consistency()
 RETURNS TABLE(topic_id uuid, name text, card_readers bigint, tab_readers bigint, page_loads bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE o uuid;
BEGIN
  IF NOT (has_role((select auth.uid()), 'admin') OR has_role((select auth.uid()), 'superadmin')) THEN RETURN; END IF;
  FOR o IN SELECT DISTINCT t.created_by FROM topics t WHERE NOT t.is_archived AND t.created_by IS NOT NULL LOOP
    RETURN QUERY
      SELECT c.topic_id, tp.name, c.readers_week, (get_topic_readership(c.topic_id)->>'readers_week')::bigint, c.visits_week
      FROM get_dashboard_feed_cards(o) c JOIN topics tp ON tp.id = c.topic_id;
  END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.admin_reader_consistency() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reader_consistency() TO authenticated;