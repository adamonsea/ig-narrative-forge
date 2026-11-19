CREATE OR REPLACE FUNCTION public.get_topic_source_periods(p_topic_id uuid)
RETURNS TABLE(kind text, source_id uuid, w integer, m integer, y integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT can_view_topic_stats(p_topic_id) THEN RETURN; END IF;
  RETURN QUERY
  SELECT 'news'::text, ta.source_id,
         COUNT(*) FILTER (WHERE s.created_at >= now() - interval '7 days')::integer,
         COUNT(*) FILTER (WHERE s.created_at >= now() - interval '30 days')::integer,
         COUNT(*)::integer
  FROM stories s
  JOIN topic_articles ta ON ta.id = s.topic_article_id
  WHERE ta.topic_id = p_topic_id AND ta.source_id IS NOT NULL
    AND s.is_published = true
    AND s.created_at >= now() - interval '365 days'
  GROUP BY ta.source_id
  UNION ALL
  SELECT 'events'::text, e.event_source_id,
         COUNT(*) FILTER (WHERE e.created_at >= now() - interval '7 days')::integer,
         COUNT(*) FILTER (WHERE e.created_at >= now() - interval '30 days')::integer,
         COUNT(*)::integer
  FROM events e
  WHERE e.topic_id = p_topic_id AND e.event_source_id IS NOT NULL
    AND e.status = 'published'
    AND e.created_at >= now() - interval '365 days'
  GROUP BY e.event_source_id;
END $$;
REVOKE ALL ON FUNCTION public.get_topic_source_periods(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_topic_source_periods(uuid) TO authenticated, service_role;