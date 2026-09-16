
CREATE OR REPLACE FUNCTION public.get_topic_daily_flow(p_topic_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (day date, gathered bigint, published bigint)
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
  days AS (
    SELECT generate_series(
      (current_date - (GREATEST(p_days, 1) - 1))::date,
      current_date,
      interval '1 day'
    )::date AS day
  ),
  g AS (
    SELECT ta.created_at::date AS day, count(*) AS n
    FROM public.topic_articles ta
    WHERE ta.topic_id = p_topic_id
      AND ta.created_at >= current_date - (GREATEST(p_days, 1) - 1)
      AND EXISTS (SELECT 1 FROM allowed)
    GROUP BY 1
  ),
  p AS (
    SELECT s.published_at::date AS day, count(*) AS n
    FROM public.stories s
    JOIN public.topic_articles ta ON ta.id = s.topic_article_id
    WHERE ta.topic_id = p_topic_id
      AND s.is_published = true
      AND s.published_at >= current_date - (GREATEST(p_days, 1) - 1)
      AND EXISTS (SELECT 1 FROM allowed)
    GROUP BY 1
  )
  SELECT d.day, coalesce(g.n, 0) AS gathered, coalesce(p.n, 0) AS published
  FROM days d
  LEFT JOIN g ON g.day = d.day
  LEFT JOIN p ON p.day = d.day
  ORDER BY d.day;
$$;

GRANT EXECUTE ON FUNCTION public.get_topic_daily_flow(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_topic_daily_flow(uuid, integer) TO service_role;
