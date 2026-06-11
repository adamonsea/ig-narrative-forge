CREATE OR REPLACE FUNCTION public.get_discover_feeds()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  description text,
  topic_type text,
  region text,
  published_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.slug, t.description, t.topic_type, t.region,
         count(s.id) AS published_count
  FROM topics t
  JOIN topic_articles ta ON ta.topic_id = t.id
  JOIN stories s ON s.topic_article_id = ta.id AND s.is_published = true
  WHERE t.is_active = true AND t.is_public = true
  GROUP BY t.id, t.name, t.slug, t.description, t.topic_type, t.region
  HAVING count(s.id) > 0
  ORDER BY t.name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_discover_feeds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_discover_feeds() TO anon, authenticated, service_role;