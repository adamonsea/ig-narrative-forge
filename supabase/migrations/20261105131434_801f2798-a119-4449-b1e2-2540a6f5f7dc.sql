ALTER TABLE public.story_impressions ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;
ALTER TABLE public.story_impressions ADD COLUMN IF NOT EXISTS max_dwell_ms integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.record_story_views(p_topic_id uuid, p_visitor_id text, p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE n integer := 0;
BEGIN
  IF p_topic_id IS NULL OR p_visitor_id IS NULL OR length(p_visitor_id) NOT BETWEEN 1 AND 128 THEN RETURN 0; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 100 THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM topics WHERE id = p_topic_id) THEN RETURN 0; END IF;
  INSERT INTO story_impressions AS si (topic_id, story_id, visitor_id, impression_date, paused, max_dwell_ms)
  SELECT p_topic_id, i.story_id, p_visitor_id, CURRENT_DATE, bool_or(i.paused), LEAST(30000, GREATEST(0, MAX(i.dwell)))
  FROM (SELECT (e->>'s')::uuid story_id, COALESCE((e->>'p')::boolean, false) paused, COALESCE((e->>'d')::int, 0) dwell
        FROM jsonb_array_elements(p_items) e WHERE (e->>'s') ~ '^[0-9a-f-]{36}$') i
  JOIN stories s ON s.id = i.story_id JOIN topic_articles ta ON ta.id = s.topic_article_id AND ta.topic_id = p_topic_id
  GROUP BY i.story_id
  ON CONFLICT (topic_id, story_id, visitor_id, impression_date) DO UPDATE
    SET paused = si.paused OR EXCLUDED.paused, max_dwell_ms = GREATEST(si.max_dwell_ms, EXCLUDED.max_dwell_ms);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $f$;
REVOKE ALL ON FUNCTION public.record_story_views(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_story_views(uuid, text, jsonb) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_topic_eye_catching(p_topic_id uuid)
RETURNS TABLE(story_id uuid, title text, seen bigint, stop_rate numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT s.id, s.title, x.seen_n, x.rate FROM (
    SELECT si.story_id sid, COUNT(DISTINCT si.visitor_id) seen_n,
           COUNT(DISTINCT si.visitor_id) FILTER (WHERE si.paused)::numeric / COUNT(DISTINCT si.visitor_id) rate
    FROM story_impressions si WHERE si.topic_id = p_topic_id AND NOT si.is_internal AND si.impression_date >= CURRENT_DATE - 6
    GROUP BY si.story_id HAVING COUNT(DISTINCT si.visitor_id) >= 20) x
  JOIN stories s ON s.id = x.sid ORDER BY x.rate DESC, x.seen_n DESC LIMIT 3;
END $f$;
REVOKE ALL ON FUNCTION public.get_topic_eye_catching(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_topic_eye_catching(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_dashboard_feed_cards(uuid);
CREATE FUNCTION public.get_dashboard_feed_cards(p_user_id uuid)
RETURNS TABLE(
  topic_id uuid, reading_now bigint, reads_week bigint, reads_prev_week bigint, reads_daily int[],
  first_read_date date, top_story_id uuid, top_story_title text, top_story_image text, top_story_reads bigint,
  subscribers_total bigint, subscribers_week bigint, email_subscribers bigint, push_subscribers bigint,
  registrants_total bigint, installs_total bigint, published_week bigint, sources_count bigint,
  arrivals_count bigint,
  readers_today bigint, readers_week bigint, readers_prev_week bigint,
  weekly_reads int[], best_prior_day bigint, best_day_date date, best_day_reads bigint,
  median_story_reads numeric, reads_total bigint, published_total bigint,
  new_referrer text, new_referrer_readers bigint,
  return_rate_week numeric, return_rate_prev numeric, loyal_reader_days bigint,
  new_country text, new_country_readers bigint, top_weekday int, top_weekday_share numeric,
  search_impressions_week bigint, search_clicks_week bigint, search_impressions_prev bigint,
  search_impressions_total bigint, search_weeks int, search_best_prior_week bigint,
  top_search_story_id uuid, top_search_story_title text, top_search_story_clicks bigint, top_query text,
  top_stop_story_id uuid, top_stop_story_title text, top_stop_rate numeric, top_stop_seen bigint, median_stop_rate numeric, stop_qualifying_stories int)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record; d record;
  v_internal text[]; v_week_start date := CURRENT_DATE - 6; v_prev_start date := CURRENT_DATE - 13;
  v_excl text := '(curatr\.pro|lovable\.app|lovableproject\.com|google\.|bing\.|duckduckgo\.|android\.gm)';
BEGIN
  IF NOT can_view_user_stats(p_user_id) THEN RETURN; END IF;

  FOR t IN SELECT tp.id FROM topics tp WHERE tp.created_by = p_user_id AND tp.is_archived = false LOOP
    IF NOT can_view_topic_stats(t.id) THEN CONTINUE; END IF;
    topic_id := t.id;
    SELECT array_agg(DISTINCT visitor_id) INTO v_internal FROM site_visits WHERE site_visits.topic_id = t.id AND is_internal;
    v_internal := COALESCE(v_internal, ARRAY[]::text[]);

    CREATE TEMP TABLE IF NOT EXISTS _reads(visitor_id text, story_id uuid, day date) ON COMMIT DROP;
    TRUNCATE _reads;
    INSERT INTO _reads
    SELECT DISTINCT r.visitor_id, r.story_id, r.day FROM (
      SELECT si.visitor_id, si.story_id, si.created_at::date AS day FROM story_interactions si
        WHERE si.topic_id = t.id AND si.interaction_type = 'swipe' AND si.story_id IS NOT NULL AND NOT si.is_internal
      UNION ALL
      SELECT sv.visitor_id, (substring(sv.page_path from '/story/([0-9a-f-]{36})'))::uuid, sv.visit_date FROM site_visits sv
        WHERE sv.topic_id = t.id AND sv.page_type = 'story' AND NOT sv.is_internal
          AND sv.page_path ~ '/story/[0-9a-f-]{36}'
    ) r WHERE r.visitor_id IS NOT NULL AND NOT (r.visitor_id = ANY(v_internal));

    SELECT COUNT(*) FILTER (WHERE day >= v_week_start), COUNT(*) FILTER (WHERE day BETWEEN v_prev_start AND v_week_start - 1), MIN(day), COUNT(*)
      INTO reads_week, reads_prev_week, first_read_date, reads_total FROM _reads;
    SELECT array_agg(COALESCE(c.n,0)::int ORDER BY g.day) INTO reads_daily
      FROM generate_series(v_week_start, CURRENT_DATE, interval '1 day') g(day)
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

    readers_today := count_topic_visitors(t.id, CURRENT_DATE);
    readers_week := count_topic_visitors(t.id, v_week_start);
    readers_prev_week := count_topic_visitors(t.id, v_prev_start, v_week_start - 1);

    SELECT COUNT(*) FILTER (WHERE live.visitor_id IS NOT NULL) INTO reading_now FROM (
      SELECT DISTINCT visitor_id FROM site_visits WHERE site_visits.topic_id = t.id AND NOT is_internal
        AND page_type IN ('feed','story','play') AND created_at > now() - interval '1 hour'
      UNION
      SELECT DISTINCT visitor_id FROM story_interactions WHERE story_interactions.topic_id = t.id AND NOT is_internal
        AND created_at > now() - interval '1 hour' AND NOT (visitor_id = ANY(v_internal))
    ) live;

    WITH v AS (SELECT DISTINCT visitor_id, visit_date FROM site_visits WHERE site_visits.topic_id = t.id AND NOT is_internal AND page_type IN ('feed','story','play'))
    SELECT
      (SELECT CASE WHEN COUNT(DISTINCT a.visitor_id)=0 THEN NULL ELSE COUNT(DISTINCT a.visitor_id) FILTER (WHERE EXISTS (SELECT 1 FROM v b WHERE b.visitor_id=a.visitor_id AND b.visit_date < a.visit_date))::numeric / COUNT(DISTINCT a.visitor_id) END FROM v a WHERE a.visit_date >= v_week_start),
      (SELECT CASE WHEN COUNT(DISTINCT a.visitor_id)=0 THEN NULL ELSE COUNT(DISTINCT a.visitor_id) FILTER (WHERE EXISTS (SELECT 1 FROM v b WHERE b.visitor_id=a.visitor_id AND b.visit_date < a.visit_date))::numeric / COUNT(DISTINCT a.visitor_id) END FROM v a WHERE a.visit_date BETWEEN v_prev_start AND v_week_start - 1),
      (SELECT MAX(c) FROM (SELECT COUNT(*) c FROM v GROUP BY visitor_id) z)
    INTO return_rate_week, return_rate_prev, loyal_reader_days;

    new_referrer := NULL; new_referrer_readers := 0;
    SELECT h, n INTO new_referrer, new_referrer_readers FROM (
      SELECT regexp_replace(substring(referrer from '^https?://([^/]+)'), '^www\.', '') h,
             COUNT(DISTINCT visitor_id) FILTER (WHERE visit_date >= v_week_start) n,
             COUNT(*) FILTER (WHERE visit_date BETWEEN v_week_start - 28 AND v_week_start - 1) prior
      FROM site_visits WHERE site_visits.topic_id = t.id AND NOT is_internal AND visit_date >= v_week_start - 28 AND referrer IS NOT NULL
      GROUP BY 1) q
    WHERE h IS NOT NULL AND h !~ v_excl AND prior = 0 AND n > 0 ORDER BY n DESC LIMIT 1;

    new_country := NULL; new_country_readers := 0;
    SELECT country_code, n INTO new_country, new_country_readers FROM (
      SELECT country_code, COUNT(DISTINCT visitor_id) n, MIN(visit_date) first_seen
      FROM site_visits WHERE site_visits.topic_id = t.id AND NOT is_internal AND country_code IS NOT NULL AND country_code <> ''
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

    SELECT s.id, s.title, x.rate, x.seen INTO top_stop_story_id, top_stop_story_title, top_stop_rate, top_stop_seen
      FROM (SELECT si.story_id, COUNT(DISTINCT si.visitor_id) seen,
                   COUNT(DISTINCT si.visitor_id) FILTER (WHERE si.paused)::numeric / COUNT(DISTINCT si.visitor_id) rate
            FROM story_impressions si WHERE si.topic_id = t.id AND NOT si.is_internal AND si.impression_date >= v_week_start
            GROUP BY si.story_id HAVING COUNT(DISTINCT si.visitor_id) >= 20 ORDER BY rate DESC, seen DESC LIMIT 1) x
      JOIN stories s ON s.id = x.story_id;
    IF NOT FOUND THEN top_stop_story_id := NULL; top_stop_story_title := NULL; top_stop_rate := NULL; top_stop_seen := NULL; END IF;
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY rate), COUNT(*) INTO median_stop_rate, stop_qualifying_stories FROM (
      SELECT COUNT(DISTINCT si.visitor_id) FILTER (WHERE si.paused)::numeric / COUNT(DISTINCT si.visitor_id) rate
      FROM story_impressions si WHERE si.topic_id = t.id AND NOT si.is_internal AND si.impression_date >= CURRENT_DATE - 27
      GROUP BY si.story_id HAVING COUNT(DISTINCT si.visitor_id) >= 20) z;

    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_dashboard_feed_cards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_feed_cards(uuid) TO authenticated, service_role;