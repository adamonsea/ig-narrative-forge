CREATE OR REPLACE FUNCTION public.get_dashboard_feed_cards(p_user_id uuid)
RETURNS TABLE(
  topic_id uuid, reading_now bigint, reads_week bigint, reads_prev_week bigint, reads_daily int[],
  first_read_date date, top_story_id uuid, top_story_title text, top_story_image text, top_story_reads bigint,
  subscribers_total bigint, subscribers_week bigint, email_subscribers bigint, push_subscribers bigint,
  registrants_total bigint, installs_total bigint, published_week bigint, sources_count bigint,
  arrivals_count bigint, insight_type text, insight_text text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record; d record;
  v_internal text[]; v_week_start date := CURRENT_DATE - 6; v_prev_start date := CURRENT_DATE - 13;
  v_best_prior bigint; v_weeks int; v_ref_host text; v_ref_n bigint; m int;
BEGIN
  IF NOT can_view_user_stats(p_user_id) THEN RETURN; END IF;

  FOR t IN SELECT tp.id FROM topics tp WHERE tp.created_by = p_user_id AND tp.is_archived = false LOOP
    topic_id := t.id;
    SELECT array_agg(DISTINCT visitor_id) INTO v_internal FROM site_visits WHERE site_visits.topic_id = t.id AND is_internal;
    v_internal := COALESCE(v_internal, ARRAY[]::text[]);

    CREATE TEMP TABLE IF NOT EXISTS _reads(visitor_id text, story_id uuid, day date) ON COMMIT DROP;
    TRUNCATE _reads;
    INSERT INTO _reads
    SELECT DISTINCT r.visitor_id, r.story_id, r.day FROM (
      SELECT si.visitor_id, si.story_id, si.created_at::date AS day FROM story_interactions si
        WHERE si.topic_id = t.id AND si.interaction_type = 'swipe' AND si.story_id IS NOT NULL
      UNION ALL
      SELECT sv.visitor_id, (substring(sv.page_path from '/story/([0-9a-f-]{36})'))::uuid, sv.visit_date FROM site_visits sv
        WHERE sv.topic_id = t.id AND sv.page_type = 'story' AND NOT sv.is_internal
          AND sv.page_path ~ '/story/[0-9a-f-]{36}'
    ) r WHERE r.visitor_id IS NOT NULL AND NOT (r.visitor_id = ANY(v_internal));

    SELECT COUNT(*) FILTER (WHERE day >= v_week_start), COUNT(*) FILTER (WHERE day BETWEEN v_prev_start AND v_week_start - 1), MIN(day)
      INTO reads_week, reads_prev_week, first_read_date FROM _reads;
    SELECT array_agg(COALESCE(c.n,0)::int ORDER BY g.day) INTO reads_daily
      FROM generate_series(v_week_start, CURRENT_DATE, interval '1 day') g(day)
      LEFT JOIN (SELECT day, COUNT(*) n FROM _reads GROUP BY day) c ON c.day = g.day::date;

    SELECT s.id, s.title, s.cover_illustration_url, x.n INTO top_story_id, top_story_title, top_story_image, top_story_reads
      FROM (SELECT story_id, COUNT(*) n FROM _reads WHERE day >= v_week_start GROUP BY story_id ORDER BY n DESC LIMIT 1) x
      JOIN stories s ON s.id = x.story_id;
    IF NOT FOUND THEN top_story_id := NULL; top_story_title := NULL; top_story_image := NULL; top_story_reads := NULL; END IF;

    SELECT COUNT(*) FILTER (WHERE live.visitor_id IS NOT NULL) INTO reading_now FROM (
      SELECT DISTINCT visitor_id FROM site_visits WHERE site_visits.topic_id = t.id AND NOT is_internal
        AND page_type IN ('feed','story','play') AND created_at > now() - interval '1 hour'
      UNION
      SELECT DISTINCT visitor_id FROM story_interactions WHERE story_interactions.topic_id = t.id
        AND created_at > now() - interval '1 hour' AND NOT (visitor_id = ANY(v_internal))
    ) live;

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

    -- insight (first match wins)
    insight_type := NULL; insight_text := NULL;
    FOREACH m IN ARRAY ARRAY[1000,500,250,100,50] LOOP
      IF subscribers_total >= m AND subscribers_total - subscribers_week < m THEN
        insight_type := 'milestone'; insight_text := m || 'th subscriber this week'; EXIT;
      END IF;
    END LOOP;
    IF insight_type IS NULL AND reads_week >= 20 AND first_read_date <= CURRENT_DATE - 27 THEN
      v_weeks := ((v_week_start - first_read_date) / 7);
      SELECT MAX(n) INTO v_best_prior FROM (
        SELECT COUNT(r.*) n FROM generate_series(1, v_weeks) w
        LEFT JOIN _reads r ON r.day BETWEEN v_week_start - 7*w AND v_week_start - 7*w + 6 GROUP BY w) z;
      IF reads_week > COALESCE(v_best_prior, 0) THEN insight_type := 'best_week'; insight_text := 'Best week yet'; END IF;
    END IF;
    IF insight_type IS NULL THEN
      SELECT h, n INTO v_ref_host, v_ref_n FROM (
        SELECT regexp_replace(substring(referrer from '^https?://([^/]+)'), '^www\.', '') h, COUNT(DISTINCT visitor_id) n
        FROM site_visits WHERE site_visits.topic_id = t.id AND NOT is_internal AND visit_date >= v_week_start AND referrer IS NOT NULL
        GROUP BY 1) q
      WHERE h IS NOT NULL AND h !~ '(curatr\.pro|lovable\.app|lovableproject\.com|google\.|bing\.|duckduckgo\.)' ORDER BY n DESC LIMIT 1;
      IF v_ref_n >= 10 THEN insight_type := 'referral'; insight_text := v_ref_host || ' sent ' || v_ref_n || ' readers'; END IF;
    END IF;
    IF insight_type IS NULL AND reads_week >= 20 AND reads_prev_week >= 5
       AND reads_week >= reads_prev_week * 1.5 THEN
      insight_type := 'jump'; insight_text := 'Reads up ' || round((reads_week - reads_prev_week) * 100.0 / reads_prev_week) || '% on last week';
    END IF;
    IF insight_type IS NULL AND reads_week >= 10 AND top_story_reads * 100 >= reads_week * 40 THEN
      insight_type := 'top_story'; insight_text := 'One story drove ' || round(top_story_reads * 100.0 / reads_week) || '% of reads';
    END IF;

    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_dashboard_feed_cards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_feed_cards(uuid) TO authenticated, service_role;