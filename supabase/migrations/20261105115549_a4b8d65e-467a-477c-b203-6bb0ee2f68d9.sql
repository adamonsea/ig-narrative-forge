-- 1. internal flag
ALTER TABLE public.site_visits ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_site_visits_topic_date_ext ON public.site_visits (topic_id, visit_date) WHERE is_internal = false;

-- 2. shared access check
CREATE OR REPLACE FUNCTION public.can_view_topic_stats(p_topic_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (select auth.uid()) IS NOT NULL AND (
    EXISTS (SELECT 1 FROM topics t WHERE t.id = p_topic_id AND t.created_by = (select auth.uid()))
    OR has_role((select auth.uid()), 'admin') OR has_role((select auth.uid()), 'superadmin'))
$$;
CREATE OR REPLACE FUNCTION public.can_view_user_stats(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (select auth.uid()) IS NOT NULL AND (
    p_user_id = (select auth.uid())
    OR has_role((select auth.uid()), 'admin') OR has_role((select auth.uid()), 'superadmin'))
$$;

-- 3. mark owner/admin visits internal at insert time
CREATE OR REPLACE FUNCTION public.mark_internal_site_visit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (select auth.uid()) IS NOT NULL AND NEW.topic_id IS NOT NULL
     AND public.can_view_topic_stats(NEW.topic_id) THEN
    NEW.is_internal := true;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mark_internal_site_visit ON public.site_visits;
CREATE TRIGGER trg_mark_internal_site_visit BEFORE INSERT ON public.site_visits
FOR EACH ROW EXECUTE FUNCTION public.mark_internal_site_visit();

-- backfill: visitor IDs that used the dashboard/admin are curators
UPDATE public.site_visits SET is_internal = true
WHERE topic_id IS NOT NULL AND is_internal = false
  AND visitor_id IN (SELECT DISTINCT visitor_id FROM public.site_visits WHERE page_type IN ('dashboard','admin'));

-- 4. single visitor definition (feed+story+play, external only, inclusive dates)
CREATE OR REPLACE FUNCTION public.count_topic_visitors(p_topic_id uuid, p_from date, p_to date DEFAULT CURRENT_DATE)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(DISTINCT visitor_id)::bigint FROM site_visits
  WHERE topic_id = p_topic_id AND is_internal = false
    AND page_type IN ('feed','story','play')
    AND visit_date BETWEEN p_from AND p_to
$$;
REVOKE ALL ON FUNCTION public.count_topic_visitors(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_internal_site_visit() FROM PUBLIC, anon, authenticated;

-- 5. topic visitor stats
CREATE OR REPLACE FUNCTION public.get_topic_visitor_stats(p_topic_id uuid)
RETURNS TABLE(visits_today bigint, visits_this_week bigint, play_mode_visits_week bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY SELECT
    count_topic_visitors(p_topic_id, CURRENT_DATE),
    count_topic_visitors(p_topic_id, CURRENT_DATE - 6),
    (SELECT COUNT(DISTINCT visitor_id)::bigint FROM site_visits
       WHERE topic_id = p_topic_id AND is_internal = false AND page_type = 'play' AND visit_date >= CURRENT_DATE - 6);
END $$;

CREATE OR REPLACE FUNCTION public.get_site_visitor_stats(p_user_id uuid)
RETURNS TABLE(topic_id uuid, today_visitors bigint, week_visitors bigint, total_pageviews bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_view_user_stats(p_user_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT sv.topic_id,
    COUNT(DISTINCT sv.visitor_id) FILTER (WHERE sv.visit_date = CURRENT_DATE),
    COUNT(DISTINCT sv.visitor_id) FILTER (WHERE sv.visit_date >= CURRENT_DATE - 6),
    COUNT(*) FILTER (WHERE sv.visit_date >= CURRENT_DATE - 6)
  FROM site_visits sv JOIN topics t ON sv.topic_id = t.id
  WHERE t.created_by = p_user_id AND sv.is_internal = false
    AND sv.page_type IN ('feed','story','play')
  GROUP BY sv.topic_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_topic_visitor_breakdown(p_topic_id uuid, p_days integer DEFAULT 7)
RETURNS TABLE(today_new bigint, today_returning bigint, week_new bigint, week_returning bigint, total_unique bigint, return_rate_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_start date := CURRENT_DATE - (GREATEST(p_days,1) - 1);
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY
  WITH v AS (
    SELECT visitor_id, visit_date FROM site_visits
    WHERE topic_id = p_topic_id AND is_internal = false AND page_type IN ('feed','story','play')
  ), f AS (SELECT visitor_id, MIN(visit_date) fd, COUNT(DISTINCT visit_date) days FROM v GROUP BY visitor_id),
  t AS (SELECT DISTINCT v.visitor_id, f.fd FROM v JOIN f USING (visitor_id) WHERE v.visit_date = CURRENT_DATE),
  w AS (SELECT DISTINCT v.visitor_id, f.fd FROM v JOIN f USING (visitor_id) WHERE v.visit_date >= v_start)
  SELECT
    (SELECT COUNT(*) FROM t WHERE fd = CURRENT_DATE)::bigint,
    (SELECT COUNT(*) FROM t WHERE fd < CURRENT_DATE)::bigint,
    (SELECT COUNT(*) FROM w WHERE fd >= v_start)::bigint,
    (SELECT COUNT(*) FROM w WHERE fd < v_start)::bigint,
    (SELECT COUNT(*) FROM f)::bigint,
    CASE WHEN (SELECT COUNT(*) FROM f) > 0
      THEN ROUND((SELECT COUNT(*) FROM f WHERE days > 1)::numeric / (SELECT COUNT(*) FROM f) * 100, 1) ELSE 0 END;
END $$;

CREATE OR REPLACE FUNCTION public.get_topic_engagement_funnel(p_topic_id uuid, p_days integer DEFAULT 7)
RETURNS TABLE(visitors bigint, engaged bigint, completed bigint, shared bigint, source_clicks bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_start date := CURRENT_DATE - (GREATEST(p_days,1) - 1);
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY
  WITH ext AS (
    SELECT DISTINCT visitor_id FROM site_visits
    WHERE topic_id = p_topic_id AND is_internal = false AND page_type IN ('feed','story','play') AND visit_date >= v_start
  ), si AS (
    SELECT s.* FROM story_interactions s
    WHERE s.topic_id = p_topic_id AND s.created_at >= v_start
      AND s.visitor_id NOT IN (SELECT visitor_id FROM site_visits WHERE topic_id = p_topic_id AND is_internal)
  ), sc AS (SELECT story_id, COUNT(*) n FROM slides GROUP BY story_id)
  SELECT
    (SELECT COUNT(*) FROM ext)::bigint,
    (SELECT COUNT(DISTINCT visitor_id) FROM si WHERE interaction_type = 'swipe')::bigint,
    (SELECT COUNT(DISTINCT si.visitor_id) FROM si JOIN sc ON sc.story_id = si.story_id
       WHERE si.interaction_type = 'swipe' AND si.slide_index >= sc.n - 1)::bigint,
    (SELECT COUNT(DISTINCT visitor_id) FROM si WHERE interaction_type = 'share_click')::bigint,
    (SELECT COUNT(DISTINCT visitor_id) FROM si WHERE interaction_type = 'source_click')::bigint;
END $$;

-- 6. guarded wrappers around long existing functions (keep bodies as private impls)
ALTER FUNCTION public.get_user_dashboard_stats(uuid) RENAME TO _impl_user_dashboard_stats;
ALTER FUNCTION public.get_topic_engagement_averages(uuid, integer) RENAME TO _impl_topic_engagement_averages;
ALTER FUNCTION public.get_topic_interaction_stats(uuid, integer) RENAME TO _impl_topic_interaction_stats;
ALTER FUNCTION public.get_topic_install_stats(uuid) RENAME TO _impl_topic_install_stats;
ALTER FUNCTION public.get_topic_registrant_stats(uuid) RENAME TO _impl_topic_registrant_stats;
ALTER FUNCTION public.get_topic_source_stats(uuid) RENAME TO _impl_topic_source_stats;
ALTER FUNCTION public.get_source_health_stats(uuid) RENAME TO _impl_source_health_stats;
ALTER FUNCTION public.get_ab_test_stats(text, integer) RENAME TO _impl_ab_test_stats;
REVOKE ALL ON FUNCTION public._impl_user_dashboard_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._impl_topic_engagement_averages(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._impl_topic_interaction_stats(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._impl_topic_install_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._impl_topic_registrant_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._impl_topic_source_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._impl_source_health_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._impl_ab_test_stats(text, integer) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_user_dashboard_stats(p_user_id uuid)
RETURNS TABLE(topic_id uuid, articles_in_arrivals bigint, stories_published_week bigint, visits_today bigint, visits_this_week bigint, visits_last_week bigint, play_mode_visits_week bigint, articles_liked bigint, articles_disliked bigint, share_clicks bigint, source_clicks bigint, quiz_responses_count bigint, installs_this_week bigint, installs_total bigint, registrants_this_week bigint, registrants_total bigint, avg_stories_engaged numeric, avg_carousel_swipes numeric, avg_final_slides_seen numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_view_user_stats(p_user_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT d.topic_id, d.articles_in_arrivals, d.stories_published_week,
    count_topic_visitors(d.topic_id, CURRENT_DATE),
    count_topic_visitors(d.topic_id, CURRENT_DATE - 6),
    count_topic_visitors(d.topic_id, CURRENT_DATE - 13, CURRENT_DATE - 7),
    (SELECT COUNT(DISTINCT sv.visitor_id)::bigint FROM site_visits sv
       WHERE sv.topic_id = d.topic_id AND sv.is_internal = false AND sv.page_type = 'play' AND sv.visit_date >= CURRENT_DATE - 6),
    d.articles_liked, d.articles_disliked, d.share_clicks, d.source_clicks, d.quiz_responses_count,
    d.installs_this_week, d.installs_total, d.registrants_this_week, d.registrants_total,
    d.avg_stories_engaged, d.avg_carousel_swipes, d.avg_final_slides_seen
  FROM _impl_user_dashboard_stats(p_user_id) d;
END $$;

CREATE FUNCTION public.get_topic_engagement_averages(p_topic_id uuid, p_days integer DEFAULT 7)
RETURNS TABLE(avg_stories_engaged numeric, avg_carousel_swipes numeric, avg_final_slides_seen numeric, total_source_clicks bigint, play_mode_visitors_week bigint, total_visitors bigint, total_stories_engaged bigint, total_completed bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY SELECT a.avg_stories_engaged, a.avg_carousel_swipes, a.avg_final_slides_seen, a.total_source_clicks,
    (SELECT COUNT(DISTINCT sv.visitor_id)::bigint FROM site_visits sv WHERE sv.topic_id = p_topic_id AND sv.is_internal = false
       AND sv.page_type = 'play' AND sv.visit_date >= CURRENT_DATE - (GREATEST(p_days,1) - 1)),
    count_topic_visitors(p_topic_id, CURRENT_DATE - (GREATEST(p_days,1) - 1)),
    a.total_stories_engaged, a.total_completed
  FROM _impl_topic_engagement_averages(p_topic_id, p_days) a;
END $$;

CREATE FUNCTION public.get_topic_interaction_stats(p_topic_id uuid, p_days integer DEFAULT 7)
RETURNS TABLE(articles_swiped bigint, total_swipes bigint, share_clicks bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM _impl_topic_interaction_stats(p_topic_id, p_days); END $$;

CREATE FUNCTION public.get_topic_install_stats(p_topic_id uuid)
RETURNS TABLE(installs_this_week bigint, installs_total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM _impl_topic_install_stats(p_topic_id); END $$;

CREATE FUNCTION public.get_topic_registrant_stats(p_topic_id uuid)
RETURNS TABLE(registrants_this_week bigint, registrants_total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM _impl_topic_registrant_stats(p_topic_id); END $$;

CREATE FUNCTION public.get_topic_source_stats(p_topic_id uuid)
RETURNS TABLE(source_id uuid, source_name text, feed_url text, canonical_domain text, is_active boolean, is_gathering boolean, stories_published_7d integer, stories_published_total integer, last_story_date timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM _impl_topic_source_stats(p_topic_id); END $$;

CREATE FUNCTION public.get_source_health_stats(p_topic_id uuid)
RETURNS TABLE(source_id uuid, source_name text, success_rate numeric, articles_last_7_days bigint, last_success_at timestamp with time zone, consecutive_failures integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM _impl_source_health_stats(p_topic_id); END $$;

CREATE FUNCTION public.get_ab_test_stats(p_test_name text, p_days integer DEFAULT 7)
RETURNS TABLE(variant text, impressions bigint, clicks bigint, ctr numeric, unique_visitors bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role((select auth.uid()), 'admin') OR has_role((select auth.uid()), 'superadmin')) THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM _impl_ab_test_stats(p_test_name, p_days); END $$;

-- 7. execute rights: signed-in only, never anon
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'get_user_dashboard_stats(uuid)','get_site_visitor_stats(uuid)','get_topic_visitor_stats(uuid)',
    'get_topic_visitor_breakdown(uuid,integer)','get_topic_engagement_funnel(uuid,integer)',
    'get_topic_engagement_averages(uuid,integer)','get_topic_interaction_stats(uuid,integer)',
    'get_topic_install_stats(uuid)','get_topic_registrant_stats(uuid)','get_topic_source_stats(uuid)',
    'get_source_health_stats(uuid)','get_ab_test_stats(text,integer)',
    'can_view_topic_stats(uuid)','can_view_user_stats(uuid)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;