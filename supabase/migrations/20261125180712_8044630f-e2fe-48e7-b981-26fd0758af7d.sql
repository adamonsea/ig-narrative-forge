CREATE TABLE public.feed_health (
  topic_id uuid PRIMARY KEY REFERENCES public.topics(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'green',
  reason text,
  owner_action text,
  broken_sources int NOT NULL DEFAULT 0,
  checked_at timestamptz NOT NULL DEFAULT now(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  red_since timestamptz,
  emailed_at timestamptz
);
GRANT SELECT ON public.feed_health TO authenticated;
GRANT ALL ON public.feed_health TO service_role;
ALTER TABLE public.feed_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service manages feed health" ON public.feed_health FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.compute_feed_health()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
  v_status text; v_reason text; v_action text;
  v_total int; v_broken int; v_stuck int; v_failed int; v_ev int;
  v_last timestamptz; v_cnt int; v_gap interval; v_quiet interval;
BEGIN
  FOR r IN SELECT id FROM topics WHERE is_active AND NOT coalesce(is_archived,false) LOOP
    SELECT count(*), count(*) FILTER (WHERE coalesce(cs.consecutive_failures,0) >= 3)
      INTO v_total, v_broken
      FROM topic_sources ts JOIN content_sources cs ON cs.id = ts.source_id
      WHERE ts.topic_id = r.id AND ts.is_active AND cs.is_active;
    SELECT count(*) INTO v_stuck FROM content_generation_queue q JOIN topic_articles ta ON ta.id = q.topic_article_id
      WHERE ta.topic_id = r.id AND q.status = 'processing' AND q.started_at < now() - interval '30 minutes';
    SELECT count(*) INTO v_failed FROM content_generation_queue q JOIN topic_articles ta ON ta.id = q.topic_article_id
      WHERE ta.topic_id = r.id AND q.status = 'failed' AND coalesce(q.completed_at, q.created_at) > now() - interval '24 hours';
    SELECT count(*) INTO v_ev FROM event_sources e
      WHERE e.topic_id = r.id AND e.is_active AND (coalesce(e.consecutive_empty_checks,0) >= 3 OR e.last_error IS NOT NULL);
    WITH p AS (
      SELECT s.published_at FROM stories s JOIN topic_articles ta ON ta.id = s.topic_article_id
      WHERE ta.topic_id = r.id AND s.is_published AND s.published_at > now() - interval '14 days'
    ), g AS (SELECT published_at - lag(published_at) OVER (ORDER BY published_at) gap FROM p)
    SELECT (SELECT max(published_at) FROM p), (SELECT count(*) FROM p),
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY gap) FROM g WHERE gap IS NOT NULL)
      INTO v_last, v_cnt, v_gap;
    v_quiet := greatest(coalesce(v_gap, interval '0') * 4, interval '24 hours');

    v_status := 'green'; v_reason := NULL; v_action := NULL;
    IF v_total > 0 AND v_broken = v_total THEN
      v_status := 'red'; v_reason := 'All sources stopped working';
      v_action := v_broken || CASE WHEN v_broken = 1 THEN ' source stopped working' ELSE ' sources stopped working' END;
    ELSIF v_cnt >= 5 AND v_last < now() - v_quiet THEN
      v_status := 'red'; v_reason := 'No new stories for ' || round(extract(epoch FROM now() - v_last)/3600) || ' hours';
    ELSIF v_broken > 0 THEN
      v_status := 'amber'; v_reason := v_broken || CASE WHEN v_broken = 1 THEN ' source stopped working' ELSE ' sources stopped working' END;
      v_action := v_reason;
    ELSIF v_stuck > 0 THEN
      v_status := 'amber'; v_reason := v_stuck || ' stories stuck in writing';
    ELSIF v_failed >= 3 THEN
      v_status := 'amber'; v_reason := v_failed || ' rewrites failed today';
    ELSIF v_ev > 0 THEN
      v_status := 'amber'; v_reason := v_ev || CASE WHEN v_ev = 1 THEN ' events source not working' ELSE ' events sources not working' END;
      v_action := v_reason;
    END IF;
    IF v_status <> 'red' AND v_broken > 0 AND v_action IS NULL THEN
      v_action := v_broken || CASE WHEN v_broken = 1 THEN ' source stopped working' ELSE ' sources stopped working' END;
    END IF;

    INSERT INTO feed_health AS fh (topic_id, status, reason, owner_action, broken_sources, checked_at, changed_at, red_since)
    VALUES (r.id, v_status, v_reason, v_action, v_broken, now(), now(), CASE WHEN v_status='red' THEN now() END)
    ON CONFLICT (topic_id) DO UPDATE SET
      reason = EXCLUDED.reason, owner_action = EXCLUDED.owner_action, broken_sources = EXCLUDED.broken_sources,
      checked_at = now(),
      changed_at = CASE WHEN fh.status <> EXCLUDED.status THEN now() ELSE fh.changed_at END,
      red_since = CASE WHEN EXCLUDED.status <> 'red' THEN NULL WHEN fh.status = 'red' THEN fh.red_since ELSE now() END,
      emailed_at = CASE WHEN EXCLUDED.status = 'red' AND fh.status <> 'red' THEN NULL WHEN EXCLUDED.status <> 'red' THEN NULL ELSE fh.emailed_at END,
      status = EXCLUDED.status;
    n := n + 1;
  END LOOP;
  DELETE FROM feed_health WHERE topic_id IN (SELECT id FROM topics WHERE NOT is_active OR coalesce(is_archived,false));
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.compute_feed_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_feed_health() TO service_role;

CREATE OR REPLACE FUNCTION public.get_feed_health(p_topic_id uuid)
RETURNS TABLE(status text, owner_action text, checked_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_manage_topic(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY SELECT fh.status, fh.owner_action, fh.checked_at FROM feed_health fh WHERE fh.topic_id = p_topic_id;
END $$;
REVOKE ALL ON FUNCTION public.get_feed_health(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feed_health(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_feed_health()
RETURNS TABLE(topic_id uuid, name text, slug text, status text, reason text, changed_at timestamptz, checked_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = (select auth.uid()) AND role IN ('admin','superadmin')) THEN RETURN; END IF;
  RETURN QUERY SELECT fh.topic_id, t.name, t.slug, fh.status, fh.reason, fh.changed_at, fh.checked_at
    FROM feed_health fh JOIN topics t ON t.id = fh.topic_id
    ORDER BY CASE fh.status WHEN 'red' THEN 0 WHEN 'amber' THEN 1 ELSE 2 END, t.name;
END $$;
REVOKE ALL ON FUNCTION public.admin_feed_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_feed_health() TO authenticated;

SELECT cron.schedule('feed-health-hourly', '5 * * * *', $$SELECT public.compute_feed_health();$$);