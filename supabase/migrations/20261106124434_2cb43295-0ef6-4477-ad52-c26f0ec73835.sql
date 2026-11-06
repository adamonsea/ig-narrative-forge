CREATE OR REPLACE FUNCTION public.get_widget_social_proof(p_topic_id uuid, p_story_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_internal text[];
  v_readers bigint;
BEGIN
  -- Only the widget edge function (service role) may call this; it returns public-safe aggregates only.
  IF COALESCE((select auth.role()), '') <> 'service_role' THEN RETURN NULL; END IF;

  SELECT COALESCE(array_agg(DISTINCT visitor_id), ARRAY[]::text[]) INTO v_internal
    FROM site_visits WHERE topic_id = p_topic_id AND is_internal;
  v_readers := count_topic_visitors(p_topic_id, DATE '2000-01-01');

  RETURN (
    WITH reads AS (
      SELECT DISTINCT ON (r.visitor_id, r.story_id, r.at::date) r.visitor_id, r.story_id, r.at FROM (
        SELECT si.visitor_id, si.story_id, si.created_at at FROM story_interactions si
          WHERE si.topic_id = p_topic_id AND si.interaction_type = 'swipe' AND si.story_id = ANY(p_story_ids)
            AND NOT si.is_internal AND si.created_at >= CURRENT_DATE - 6
        UNION ALL
        SELECT sv.visitor_id, (substring(sv.page_path from '/story/([0-9a-f-]{36})'))::uuid, sv.created_at FROM site_visits sv
          WHERE sv.topic_id = p_topic_id AND sv.page_type = 'story' AND NOT sv.is_internal
            AND sv.page_path ~ '/story/[0-9a-f-]{36}' AND sv.visit_date >= CURRENT_DATE - 6
      ) r WHERE r.visitor_id IS NOT NULL AND r.story_id = ANY(p_story_ids) AND NOT (r.visitor_id = ANY(v_internal))
      ORDER BY r.visitor_id, r.story_id, r.at::date, r.at DESC
    )
    SELECT jsonb_build_object(
      'readers_all_time', v_readers,
      'story_reads', COALESCE((SELECT jsonb_object_agg(story_id, n) FROM (SELECT story_id, COUNT(*) n FROM reads GROUP BY story_id) s), '{}'::jsonb),
      'trending_story_id', (SELECT story_id FROM reads WHERE at > now() - interval '3 hours'
          GROUP BY story_id HAVING COUNT(*) >= 3 ORDER BY COUNT(*) DESC, MAX(at) DESC LIMIT 1)
    )
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_widget_social_proof(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_widget_social_proof(uuid, uuid[]) TO service_role;