-- 1. Who never counts: internal (owner/admin), editor-preview and test visitors.
CREATE OR REPLACE FUNCTION public.is_test_visitor(p_visitor_id text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_visitor_id IS NULL OR p_visitor_id = ''
      OR p_visitor_id ~* '^(zz)?test'
      OR regexp_replace(p_visitor_id, '^[a-z]+_', '') ~* '^(zz)?test'
$$;

CREATE OR REPLACE FUNCTION public.topic_excluded_visitors(p_topic_id uuid)
RETURNS TABLE(vid text) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT regexp_replace(sv.visitor_id, '^[a-z]+_', '') FROM site_visits sv
   WHERE sv.topic_id = p_topic_id AND sv.visitor_id IS NOT NULL
     AND (sv.is_internal OR sv.referrer ~ '(lovableproject\.com|id-preview--)')
  UNION
  SELECT regexp_replace(x.visitor_id, '^[a-z]+_', '') FROM story_interactions x
   WHERE x.topic_id = p_topic_id AND x.visitor_id IS NOT NULL
     AND (x.is_internal OR x.referrer ~ '(lovableproject\.com|id-preview--)' OR x.user_agent = 'test')
$$;

-- 2. The single definition of an engaged reader signal.
CREATE OR REPLACE FUNCTION public.topic_engagement(
  p_topic_id uuid, p_from date, p_to date DEFAULT CURRENT_DATE,
  p_with_pauses boolean DEFAULT true, p_since timestamptz DEFAULT NULL)
RETURNS TABLE(vid text, sid uuid, dy date, signal text)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH sig AS (
    -- swipe beyond slide 1, or 10s+ on a story page after a human signal
    SELECT x.visitor_id AS raw, x.story_id AS s, x.created_at::date AS d, x.interaction_type AS k
    FROM story_interactions x
    WHERE x.topic_id = p_topic_id AND x.interaction_type IN ('swipe', 'page_dwell') AND NOT x.is_internal
      AND x.created_at >= p_from AND x.created_at < p_to + 1
      AND x.created_at >= COALESCE(p_since, '-infinity'::timestamptz)
    UNION ALL
    -- headline pause: 3s+ continuous dwell in the feed
    SELECT i.visitor_id, i.story_id, i.impression_date, 'pause'
    FROM story_impressions i
    WHERE p_with_pauses AND i.topic_id = p_topic_id AND NOT i.is_internal AND i.max_dwell_ms >= 3000
      AND i.impression_date BETWEEN p_from AND p_to
      AND i.created_at >= COALESCE(p_since, '-infinity'::timestamptz)
  )
  SELECT DISTINCT regexp_replace(g.raw, '^[a-z]+_', ''), g.s, g.d, g.k FROM sig g
  WHERE NOT is_test_visitor(g.raw)
    AND regexp_replace(g.raw, '^[a-z]+_', '') NOT IN (SELECT e.vid FROM topic_excluded_visitors(p_topic_id) e)
$$;

-- 3. Reads = distinct reader/story/day with a swipe or a 10s+ story-page stay.
CREATE OR REPLACE FUNCTION public.topic_reads(p_topic_id uuid, p_from date, p_to date DEFAULT CURRENT_DATE)
RETURNS TABLE(vid text, sid uuid, dy date)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT DISTINCT e.vid, e.sid, e.dy FROM topic_engagement(p_topic_id, p_from, p_to, false) e
  WHERE e.signal IN ('swipe', 'page_dwell') AND e.sid IS NOT NULL
$$;

-- 4. Readers = distinct engaged browsers.
CREATE OR REPLACE FUNCTION public.count_topic_readers(p_topic_id uuid, p_from date, p_to date DEFAULT CURRENT_DATE)
RETURNS bigint LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COUNT(DISTINCT e.vid)::bigint FROM topic_engagement(p_topic_id, p_from, p_to) e
$$;

-- 5. Visits keep their meaning (any page load) but never count test visitors.
CREATE OR REPLACE FUNCTION public.count_topic_visitors(p_topic_id uuid, p_from date, p_to date DEFAULT CURRENT_DATE)
 RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH internal AS (
    SELECT DISTINCT regexp_replace(visitor_id, '^[a-z]+_', '') vid FROM site_visits
    WHERE topic_id = p_topic_id AND is_internal AND visitor_id IS NOT NULL
  ), ids AS (
    SELECT visitor_id FROM site_visits WHERE topic_id = p_topic_id AND NOT is_internal
      AND page_type IN ('feed','story','play') AND visit_date BETWEEN p_from AND p_to
    UNION ALL
    SELECT visitor_id FROM story_interactions WHERE topic_id = p_topic_id AND NOT is_internal
      AND created_at::date BETWEEN p_from AND p_to
    UNION ALL
    SELECT visitor_id FROM story_impressions WHERE topic_id = p_topic_id AND NOT is_internal
      AND created_at::date BETWEEN p_from AND p_to
    UNION ALL
    SELECT visitor_id FROM feed_visits WHERE topic_id = p_topic_id AND NOT is_internal
      AND visit_date BETWEEN p_from AND p_to
  )
  SELECT COUNT(DISTINCT regexp_replace(visitor_id, '^[a-z]+_', ''))::bigint FROM ids
  WHERE NOT is_test_visitor(visitor_id)
    AND regexp_replace(visitor_id, '^[a-z]+_', '') NOT IN (SELECT vid FROM internal)
$function$;

REVOKE ALL ON FUNCTION public.topic_excluded_visitors(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.topic_engagement(uuid, date, date, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.topic_reads(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_topic_readers(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_topic_visitors(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topic_excluded_visitors(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.topic_engagement(uuid, date, date, boolean, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.topic_reads(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_topic_readers(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_topic_visitors(uuid, date, date) TO service_role;

-- 6. Dashboard card.
DROP FUNCTION IF EXISTS public.get_dashboard_feed_cards(uuid);
CREATE FUNCTION public.get_dashboard_feed_cards(p_user_id uuid)
 RETURNS TABLE(topic_id uuid, reading_now bigint, reads_week bigint, reads_prev_week bigint, reads_daily integer[], first_read_date date, top_story_id uuid, top_story_title text, top_story_image text, top_story_reads bigint, subscribers_total bigint, subscribers_week bigint, email_subscribers bigint, push_subscribers bigint, registrants_total bigint, installs_total bigint, published_week bigint, sources_count bigint, arrivals_count bigint, readers_today bigint, readers_week bigint, readers_prev_week bigint, weekly_reads integer[], best_prior_day bigint, best_day_date date, best_day_reads bigint, median_story_reads numeric, reads_total bigint, published_total bigint, new_referrer text, new_referrer_readers bigint, return_rate_week numeric, return_rate_prev numeric, loyal_reader_days bigint, new_country text, new_country_readers bigint, top_weekday integer, top_weekday_share numeric, search_impressions_week bigint, search_clicks_week bigint, search_impressions_prev bigint, search_impressions_total bigint, search_weeks integer, search_best_prior_week bigint, top_search_story_id uuid, top_search_story_title text, top_search_story_clicks bigint, top_query text, top_stop_story_id uuid, top_stop_story_title text, top_stop_rate numeric, top_stop_seen bigint, median_stop_rate numeric, stop_qualifying_stories integer, reads_month bigint, readers_month bigint, published_month bigint, reads_daily_month integer[],
   visits_week bigint, visits_month bigint, readers_weekly integer[], returning_week bigint, visits_daily integer[], readers_daily integer[], top_sources jsonb)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  t record; d record;
  v_week_start date := CURRENT_DATE - 6; v_prev_start date := CURRENT_DATE - 13;
  v_month_start date := CURRENT_DATE - 29;
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
    INSERT INTO _eng SELECT DISTINCT e.vid, e.dy FROM topic_engagement(t.id, CURRENT_DATE - 120) e;

    CREATE TEMP TABLE IF NOT EXISTS _excl(vid text) ON COMMIT DROP;
    TRUNCATE _excl;
    INSERT INTO _excl SELECT DISTINCT x.vid FROM topic_excluded_visitors(t.id) x WHERE x.vid IS NOT NULL;

    SELECT COUNT(*) FILTER (WHERE day >= v_week_start), COUNT(*) FILTER (WHERE day BETWEEN v_prev_start AND v_week_start - 1), MIN(day), COUNT(*)
      INTO reads_week, reads_prev_week, first_read_date, reads_total FROM _reads;
    reads_month := (SELECT COUNT(*) FROM _reads WHERE day >= v_month_start);
    SELECT array_agg(COALESCE(c.n,0)::int ORDER BY g.day) INTO reads_daily
      FROM generate_series(v_week_start, CURRENT_DATE, interval '1 day') g(day)
      LEFT JOIN (SELECT day, COUNT(*) n FROM _reads GROUP BY day) c ON c.day = g.day::date;
    SELECT array_agg(COALESCE(c.n,0)::int ORDER BY g.day) INTO reads_daily_month
      FROM generate_series(v_month_start, CURRENT_DATE, interval '1 day') g(day)
      LEFT JOIN (SELECT day, COUNT(*) n FROM _reads GROUP BY day) c ON c.day = g.day::date;
    SELECT array_agg(COALESCE(c.n,0)::int ORDER BY w DESC) INTO weekly_reads
      FROM generate_series(0,7) w
      LEFT JOIN LATERAL (SELECT COUNT(*) n FROM _reads r WHERE r.day BETWEEN v_week_start - 7*w AND v_week_start - 7*w + 6) c ON true;
    SELECT MAX(n) INTO best_prior_day FROM (SELECT COUNT(*) n FROM _reads WHERE day < CURRENT_DATE - 1 GROUP BY day) z;
    SELECT day, n INTO best_day_date, best_day_reads FROM (SELECT day, COUNT(*) n FROM _reads WHERE day >= CURRENT_DATE - 1 GROUP BY day) z ORDER BY n DESC LIMIT 1;
    IF NOT FOUND THEN best_day_date := NULL; best_day_reads := 0; END IF;

    SELECT s.id, s.title, s.cover_illustration_url, x.n INTO top_story_id, top_story_title, top_story_image, top_story_reads
      FROM (SELECT story_id, COUNT(*) n FROM _reads WHERE day >= v_week_start GROUP BY story_id ORDER BY n DESC LIMIT 1) x
      JOIN stories s ON s.id = x.story_id;
    IF NOT FOUND THEN top_story_id := NULL; top_story_title := NULL; top_story_image := NULL; top_story_reads := NULL; END IF;
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n) INTO median_story_reads
      FROM (SELECT COUNT(*) n FROM _reads WHERE day >= CURRENT_DATE - 27 GROUP BY story_id) z;

    readers_today := (SELECT COUNT(DISTINCT e.vid) FROM _eng e WHERE e.dy = CURRENT_DATE);
    readers_week := (SELECT COUNT(DISTINCT e.vid) FROM _eng e WHERE e.dy >= v_week_start);
    readers_prev_week := (SELECT COUNT(DISTINCT e.vid) FROM _eng e WHERE e.dy BETWEEN v_prev_start AND v_week_start - 1);
    readers_month := (SELECT COUNT(DISTINCT e.vid) FROM _eng e WHERE e.dy >= v_month_start);
    SELECT array_agg(c.n::int ORDER BY w DESC) INTO readers_weekly
      FROM generate_series(0,7) w
      LEFT JOIN LATERAL (SELECT COUNT(DISTINCT e.vid) n FROM _eng e WHERE e.dy BETWEEN v_week_start - 7*w AND v_week_start - 7*w + 6) c ON true;
    returning_week := (SELECT COUNT(DISTINCT a.vid) FROM _eng a WHERE a.dy >= v_week_start
                         AND EXISTS (SELECT 1 FROM _eng b WHERE b.vid = a.vid AND b.dy < v_week_start));
    SELECT array_agg(COALESCE(c.n,0)::int ORDER BY g.day) INTO readers_daily
      FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') g(day)
      LEFT JOIN (SELECT e.dy, COUNT(DISTINCT e.vid) n FROM _eng e GROUP BY e.dy) c ON c.dy = g.day::date;
    SELECT array_agg(count_topic_visitors(t.id, g.day::date, g.day::date)::int ORDER BY g.day) INTO visits_daily
      FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') g(day);
    visits_week := count_topic_visitors(t.id, v_week_start);
    visits_month := count_topic_visitors(t.id, v_month_start);

    SELECT COUNT(DISTINCT e.vid) INTO reading_now
      FROM topic_engagement(t.id, CURRENT_DATE - 1, CURRENT_DATE, true, now() - interval '1 hour') e;

    -- Where readers came from (last 14 days): visitors per referring site and how many became readers.
    WITH ref AS (
      SELECT regexp_replace(sv.visitor_id, '^[a-z]+_', '') vid,
             regexp_replace(lower(substring(sv.referrer from '^https?://([^/:?#]+)')), '^(www\.|m\.)', '') h
        FROM site_visits sv WHERE sv.topic_id = t.id AND NOT sv.is_internal AND sv.visit_date >= CURRENT_DATE - 13 AND sv.referrer IS NOT NULL
      UNION
      SELECT regexp_replace(x.visitor_id, '^[a-z]+_', ''),
             regexp_replace(lower(substring(x.referrer from '^https?://([^/:?#]+)')), '^(www\.|m\.)', '')
        FROM story_interactions x WHERE x.topic_id = t.id AND NOT x.is_internal AND x.created_at >= CURRENT_DATE - 13 AND x.referrer IS NOT NULL
    ), agg AS (
      SELECT r.h, COUNT(DISTINCT r.vid) visitors,
             COUNT(DISTINCT r.vid) FILTER (WHERE r.vid IN (SELECT e.vid FROM _eng e WHERE e.dy >= CURRENT_DATE - 13)) readers
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
      FROM _reads WHERE day >= CURRENT_DATE - 27 GROUP BY 1) z
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

    SELECT COALESCE(SUM(impressions) FILTER (WHERE day BETWEEN CURRENT_DATE - 9 AND CURRENT_DATE - 3),0),
           COALESCE(SUM(clicks) FILTER (WHERE day BETWEEN CURRENT_DATE - 9 AND CURRENT_DATE - 3),0),
           COALESCE(SUM(impressions) FILTER (WHERE day BETWEEN CURRENT_DATE - 16 AND CURRENT_DATE - 10),0),
           COALESCE(SUM(impressions) FILTER (WHERE day <= CURRENT_DATE - 3),0),
           COALESCE(((CURRENT_DATE - 3) - MIN(day)) / 7 + 1, 0)::int
      INTO search_impressions_week, search_clicks_week, search_impressions_prev, search_impressions_total, search_weeks
      FROM search_daily sd WHERE sd.topic_id = t.id;
    SELECT MAX(n) INTO search_best_prior_week FROM (
      SELECT ((CURRENT_DATE - 3) - day) / 7 AS b, SUM(impressions) n FROM search_daily sd
      WHERE sd.topic_id = t.id AND day <= CURRENT_DATE - 10 GROUP BY 1) z;
    SELECT s.id, s.title, x.c INTO top_search_story_id, top_search_story_title, top_search_story_clicks
      FROM (SELECT story_id, SUM(clicks) c FROM search_daily sd WHERE sd.topic_id = t.id AND story_id IS NOT NULL
            AND day BETWEEN CURRENT_DATE - 9 AND CURRENT_DATE - 3 GROUP BY story_id ORDER BY c DESC LIMIT 1) x
      JOIN stories s ON s.id = x.story_id;
    IF NOT FOUND THEN top_search_story_id := NULL; top_search_story_title := NULL; top_search_story_clicks := NULL; END IF;
    SELECT sd.top_query INTO top_query FROM search_daily sd WHERE sd.topic_id = t.id AND sd.top_query IS NOT NULL
      AND day BETWEEN CURRENT_DATE - 9 AND CURRENT_DATE - 3 ORDER BY sd.clicks DESC, sd.impressions DESC LIMIT 1;
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
REVOKE ALL ON FUNCTION public.get_dashboard_feed_cards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_feed_cards(uuid) TO authenticated, service_role;

-- 7. Readership: same reads/readers, plus a feed-level stopped/swiped rate.
CREATE OR REPLACE FUNCTION public.get_topic_readership(p_topic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_internal text[];
  v_week_start date := CURRENT_DATE - 6;
  v_prev_start date := CURRENT_DATE - 13;
  v_result jsonb;
  v_dropoff jsonb;
  v_feed_signal jsonb;
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN NULL; END IF;

  SELECT COALESCE(array_agg(DISTINCT visitor_id), ARRAY[]::text[]) INTO v_internal
    FROM site_visits WHERE topic_id = p_topic_id AND is_internal;

  WITH internal AS (
    SELECT DISTINCT regexp_replace(visitor_id, '^[a-z]+_', '') vid FROM site_visits
    WHERE topic_id = p_topic_id AND is_internal AND visitor_id IS NOT NULL
  ), sess AS (
    SELECT regexp_replace(si.visitor_id, '^[a-z]+_', '') vid, si.impression_date, MAX(si.position) depth
    FROM story_impressions si
    WHERE si.topic_id = p_topic_id AND NOT si.is_internal AND si.position IS NOT NULL
      AND si.impression_date >= v_week_start
      AND regexp_replace(si.visitor_id, '^[a-z]+_', '') NOT IN (SELECT vid FROM internal)
    GROUP BY 1, 2
  ), tot AS (SELECT COUNT(*) n, MAX(depth) deepest FROM sess)
  SELECT CASE WHEN tot.n >= 30 THEN jsonb_build_object(
      'sessions', tot.n,
      'reached', (SELECT jsonb_agg((SELECT COUNT(*) FROM sess WHERE sess.depth >= k) ORDER BY k)
                  FROM generate_series(0, LEAST(11, tot.deepest)) k))
    END INTO v_dropoff FROM tot;

  -- Feed-level: of headlines outside readers saw this week, share they stopped on and share they swiped into.
  WITH excl AS (SELECT DISTINCT x.vid FROM topic_excluded_visitors(p_topic_id) x WHERE x.vid IS NOT NULL),
  imp AS (
    SELECT regexp_replace(si.visitor_id, '^[a-z]+_', '') vid, si.story_id, si.impression_date d, (si.max_dwell_ms >= 3000) stopped
    FROM story_impressions si
    WHERE si.topic_id = p_topic_id AND NOT si.is_internal AND si.impression_date >= v_week_start
      AND NOT is_test_visitor(si.visitor_id)
      AND regexp_replace(si.visitor_id, '^[a-z]+_', '') NOT IN (SELECT vid FROM excl)
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

  WITH reads AS (
    SELECT r.vid AS visitor_id, r.sid AS story_id, r.dy AS day FROM topic_reads(p_topic_id, v_prev_start) r
  ), sc AS (
    SELECT * FROM story_stop_scores(p_topic_id, v_week_start)
  ), top AS (
    SELECT s.id, s.title, s.cover_illustration_url, x.n,
           q.seen, q.stop_rate, q.swipe_rate FROM (
      SELECT story_id, COUNT(*) n FROM reads WHERE day >= v_week_start GROUP BY story_id ORDER BY n DESC LIMIT 5
    ) x JOIN stories s ON s.id = x.story_id
    LEFT JOIN sc q ON q.story_id = x.story_id AND q.qualifies
  ), days AS (
    SELECT d::date AS day, (SELECT COUNT(*) FROM reads WHERE reads.day = d::date) n
    FROM generate_series(v_week_start, CURRENT_DATE, interval '1 day') d
  )
  SELECT jsonb_build_object(
    'reads_week', (SELECT COUNT(*) FROM reads WHERE day >= v_week_start),
    'reads_prev_week', (SELECT COUNT(*) FROM reads WHERE day < v_week_start),
    'readers_week', count_topic_readers(p_topic_id, v_week_start),
    'daily', (SELECT jsonb_agg(jsonb_build_object('day', day, 'reads', n) ORDER BY day) FROM days),
    'top_stories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'reads', n, 'image', cover_illustration_url,
                      'seen', seen, 'stop_rate', stop_rate, 'swipe_rate', swipe_rate) ORDER BY n DESC) FROM top), '[]'::jsonb),
    'dropoff', v_dropoff,
    'feed_signal', v_feed_signal,
    'top_stopper', (SELECT jsonb_build_object('id', s.id, 'title', s.title, 'image', s.cover_illustration_url,
                      'seen', x.seen, 'stop_rate', x.stop_rate, 'expected_rate', x.expected_rate, 'score', x.score)
                    FROM sc x JOIN stories s ON s.id = x.story_id
                    WHERE x.qualifies ORDER BY x.score DESC, x.seen DESC LIMIT 1),
    'event_clicks_week', (SELECT COUNT(*) FROM event_clicks ec
                          WHERE ec.topic_id = p_topic_id AND ec.click_date >= v_week_start
                            AND NOT is_test_visitor(ec.visitor_id)
                            AND NOT (ec.visitor_id = ANY(v_internal)))
  ) INTO v_result;

  RETURN v_result;
END;
$function$;