CREATE OR REPLACE FUNCTION public.get_topic_readership(p_topic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_internal text[];
  v_week_start date := CURRENT_DATE - 6;
  v_prev_start date := CURRENT_DATE - 13;
  v_result jsonb;
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN NULL; END IF;

  SELECT COALESCE(array_agg(DISTINCT visitor_id), ARRAY[]::text[]) INTO v_internal
    FROM site_visits WHERE topic_id = p_topic_id AND is_internal;

  WITH reads AS (
    SELECT DISTINCT r.visitor_id, r.story_id, r.day FROM (
      SELECT si.visitor_id, si.story_id, si.created_at::date AS day FROM story_interactions si
        WHERE si.topic_id = p_topic_id AND si.interaction_type = 'swipe' AND si.story_id IS NOT NULL
          AND NOT si.is_internal AND si.created_at >= v_prev_start
      UNION ALL
      SELECT sv.visitor_id, (substring(sv.page_path from '/story/([0-9a-f-]{36})'))::uuid, sv.visit_date FROM site_visits sv
        WHERE sv.topic_id = p_topic_id AND sv.page_type = 'story' AND NOT sv.is_internal
          AND sv.page_path ~ '/story/[0-9a-f-]{36}' AND sv.visit_date >= v_prev_start
    ) r WHERE r.visitor_id IS NOT NULL AND NOT (r.visitor_id = ANY(v_internal))
  ), top AS (
    SELECT s.id, s.title, s.cover_illustration_url, x.n FROM (
      SELECT story_id, COUNT(*) n FROM reads WHERE day >= v_week_start GROUP BY story_id ORDER BY n DESC LIMIT 5
    ) x JOIN stories s ON s.id = x.story_id
  ), days AS (
    SELECT d::date AS day, (SELECT COUNT(*) FROM reads WHERE reads.day = d::date) n
    FROM generate_series(v_week_start, CURRENT_DATE, interval '1 day') d
  )
  SELECT jsonb_build_object(
    'reads_week', (SELECT COUNT(*) FROM reads WHERE day >= v_week_start),
    'reads_prev_week', (SELECT COUNT(*) FROM reads WHERE day < v_week_start),
    'readers_week', count_topic_visitors(p_topic_id, v_week_start),
    'daily', (SELECT jsonb_agg(jsonb_build_object('day', day, 'reads', n) ORDER BY day) FROM days),
    'top_stories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'reads', n, 'image', cover_illustration_url) ORDER BY n DESC) FROM top), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_topic_readership(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_topic_readership(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_topic_pulse(p_topic_id uuid, p_story_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_internal text[];
  v_state record;
  v_result jsonb;
  v_today int; v_best_other int; v_readers_all bigint;
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN NULL; END IF;

  SELECT COALESCE(array_agg(DISTINCT visitor_id), ARRAY[]::text[]) INTO v_internal
    FROM site_visits WHERE topic_id = p_topic_id AND is_internal;
  SELECT * INTO v_state FROM curator_topic_state WHERE user_id = auth.uid() AND topic_id = p_topic_id;

  CREATE TEMP TABLE IF NOT EXISTS _pulse_reads (visitor_id text, story_id uuid, at timestamptz) ON COMMIT DROP;
  TRUNCATE _pulse_reads;
  INSERT INTO _pulse_reads
  SELECT DISTINCT ON (r.visitor_id, r.story_id, r.at::date) r.visitor_id, r.story_id, r.at FROM (
    SELECT si.visitor_id, si.story_id, si.created_at at FROM story_interactions si
      WHERE si.topic_id = p_topic_id AND si.interaction_type = 'swipe' AND si.story_id IS NOT NULL
        AND NOT si.is_internal AND si.created_at >= CURRENT_DATE - 29
    UNION ALL
    SELECT sv.visitor_id, (substring(sv.page_path from '/story/([0-9a-f-]{36})'))::uuid, sv.created_at FROM site_visits sv
      WHERE sv.topic_id = p_topic_id AND sv.page_type = 'story' AND NOT sv.is_internal
        AND sv.page_path ~ '/story/[0-9a-f-]{36}' AND sv.visit_date >= CURRENT_DATE - 29
  ) r WHERE r.visitor_id IS NOT NULL AND NOT (r.visitor_id = ANY(v_internal))
  ORDER BY r.visitor_id, r.story_id, r.at::date, r.at DESC;

  SELECT COUNT(*) INTO v_today FROM _pulse_reads WHERE at::date = CURRENT_DATE;
  SELECT COALESCE(MAX(n),0) INTO v_best_other FROM (SELECT COUNT(*) n FROM _pulse_reads WHERE at::date < CURRENT_DATE GROUP BY at::date) d;
  v_readers_all := count_topic_visitors(p_topic_id, DATE '2000-01-01');

  SELECT jsonb_build_object(
    'reading_now', (SELECT COUNT(*) FROM (
        SELECT visitor_id FROM site_visits WHERE topic_id = p_topic_id AND NOT is_internal
          AND page_type IN ('feed','story','play') AND created_at > now() - interval '5 minutes'
        UNION
        SELECT visitor_id FROM story_interactions WHERE topic_id = p_topic_id AND NOT is_internal
          AND created_at > now() - interval '5 minutes'
      ) l WHERE visitor_id IS NOT NULL AND NOT (visitor_id = ANY(v_internal))),
    'reading_now_story_ids', COALESCE((SELECT jsonb_agg(DISTINCT story_id) FROM _pulse_reads
        WHERE at > now() - interval '5 minutes' AND story_id = ANY(p_story_ids)), '[]'::jsonb),
    'story_reads', COALESCE((SELECT jsonb_object_agg(story_id, n) FROM (
        SELECT story_id, COUNT(*) n FROM _pulse_reads
        WHERE at >= CURRENT_DATE - 6 AND story_id = ANY(p_story_ids) GROUP BY story_id) s), '{}'::jsonb),
    'rising_story_id', (SELECT story_id FROM _pulse_reads WHERE at > now() - interval '3 hours'
        GROUP BY story_id HAVING COUNT(*) >= 3 ORDER BY COUNT(*) DESC, MAX(at) DESC LIMIT 1),
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
END; $$;
REVOKE ALL ON FUNCTION public.get_topic_pulse(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_topic_pulse(uuid, uuid[]) TO authenticated;