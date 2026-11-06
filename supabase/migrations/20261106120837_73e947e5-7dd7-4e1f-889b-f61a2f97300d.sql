CREATE TABLE public.curator_topic_state (
  user_id uuid NOT NULL,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  desk_last_looked_at timestamptz,
  dismissed_milestones text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic_id)
);
GRANT SELECT, INSERT, UPDATE ON public.curator_topic_state TO authenticated;
GRANT ALL ON public.curator_topic_state TO service_role;
ALTER TABLE public.curator_topic_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own curator state" ON public.curator_topic_state FOR ALL TO authenticated
  USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- Live pulse for the Desk: reading now (5 min), per-story 7-day reads, rising (3h), new arrivals since last look, milestones.
CREATE OR REPLACE FUNCTION public.get_topic_pulse(p_topic_id uuid, p_story_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.mark_desk_looked(p_topic_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  INSERT INTO curator_topic_state (user_id, topic_id, desk_last_looked_at) VALUES (auth.uid(), p_topic_id, now())
  ON CONFLICT (user_id, topic_id) DO UPDATE SET desk_last_looked_at = now(), updated_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.mark_desk_looked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_desk_looked(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dismiss_topic_milestone(p_topic_id uuid, p_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT can_view_topic_stats(p_topic_id) OR length(p_key) > 80 THEN RETURN; END IF;
  INSERT INTO curator_topic_state (user_id, topic_id, dismissed_milestones) VALUES (auth.uid(), p_topic_id, ARRAY[p_key])
  ON CONFLICT (user_id, topic_id) DO UPDATE
    SET dismissed_milestones = array(SELECT DISTINCT unnest(curator_topic_state.dismissed_milestones || p_key)), updated_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.dismiss_topic_milestone(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_topic_milestone(uuid, text) TO authenticated;