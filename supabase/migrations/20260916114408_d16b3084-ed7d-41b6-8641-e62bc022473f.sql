
-- Coverage mix: share of live stories per category, this month vs last month
CREATE OR REPLACE FUNCTION public.get_topic_coverage_mix(p_topic_id uuid)
RETURNS TABLE (category_name text, current_count bigint, previous_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed AS (
    SELECT 1 FROM public.topics t
    WHERE t.id = p_topic_id
      AND (t.created_by = (select auth.uid())
           OR public.has_role((select auth.uid()), 'admin')
           OR public.has_role((select auth.uid()), 'superadmin'))
  ),
  base AS (
    SELECT c.name AS category_name, s.published_at
    FROM public.story_category_assignments a
    JOIN public.story_categories c ON c.id = a.category_id
    JOIN public.stories s ON s.id = a.story_id
    WHERE a.topic_id = p_topic_id
      AND s.is_published = true
      AND s.published_at > now() - interval '60 days'
      AND EXISTS (SELECT 1 FROM allowed)
  )
  SELECT category_name,
         count(*) FILTER (WHERE published_at > now() - interval '30 days') AS current_count,
         count(*) FILTER (WHERE published_at <= now() - interval '30 days') AS previous_count
  FROM base
  GROUP BY category_name
  ORDER BY current_count DESC, category_name
  LIMIT 12;
$$;

GRANT EXECUTE ON FUNCTION public.get_topic_coverage_mix(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_topic_coverage_mix(uuid) TO service_role;

-- Rising terms: keyword matches in last 7 days vs prior 23 days baseline
CREATE OR REPLACE FUNCTION public.get_topic_rising_terms(p_topic_id uuid)
RETURNS TABLE (term text, recent_count bigint, baseline_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed AS (
    SELECT 1 FROM public.topics t
    WHERE t.id = p_topic_id
      AND (t.created_by = (select auth.uid())
           OR public.has_role((select auth.uid()), 'admin')
           OR public.has_role((select auth.uid()), 'superadmin'))
  ),
  exploded AS (
    SELECT lower(trim(k)) AS term, ta.created_at
    FROM public.topic_articles ta
    CROSS JOIN LATERAL unnest(coalesce(ta.keyword_matches, ARRAY[]::text[])) AS k
    WHERE ta.topic_id = p_topic_id
      AND ta.created_at > now() - interval '30 days'
      AND EXISTS (SELECT 1 FROM allowed)
  )
  SELECT term,
         count(*) FILTER (WHERE created_at > now() - interval '7 days') AS recent_count,
         count(*) FILTER (WHERE created_at <= now() - interval '7 days') AS baseline_count
  FROM exploded
  WHERE term <> ''
  GROUP BY term
  HAVING count(*) FILTER (WHERE created_at > now() - interval '7 days') > 0
  ORDER BY (count(*) FILTER (WHERE created_at > now() - interval '7 days'))::numeric
           / GREATEST((count(*) FILTER (WHERE created_at <= now() - interval '7 days'))::numeric / 23.0 * 7.0, 0.5) DESC,
           recent_count DESC
  LIMIT 8;
$$;

GRANT EXECUTE ON FUNCTION public.get_topic_rising_terms(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_topic_rising_terms(uuid) TO service_role;

-- Live now: readers today and in the last hour
CREATE OR REPLACE FUNCTION public.get_topic_live_readers(p_topic_id uuid)
RETURNS TABLE (readers_last_hour bigint, readers_today bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(DISTINCT v.visitor_id) FILTER (WHERE v.visit_timestamp > now() - interval '1 hour') AS readers_last_hour,
    count(DISTINCT v.visitor_id) FILTER (WHERE v.visit_timestamp > date_trunc('day', now())) AS readers_today
  FROM public.feed_visits v
  WHERE v.topic_id = p_topic_id
    AND v.visit_timestamp > date_trunc('day', now()) - interval '1 day'
    AND EXISTS (
      SELECT 1 FROM public.topics t
      WHERE t.id = p_topic_id
        AND (t.created_by = (select auth.uid())
             OR public.has_role((select auth.uid()), 'admin')
             OR public.has_role((select auth.uid()), 'superadmin'))
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_topic_live_readers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_topic_live_readers(uuid) TO service_role;
