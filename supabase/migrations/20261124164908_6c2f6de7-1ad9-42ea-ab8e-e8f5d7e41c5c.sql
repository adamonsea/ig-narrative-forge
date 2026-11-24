CREATE OR REPLACE FUNCTION public.get_topic_pinned_stories(p_topic_id uuid)
RETURNS TABLE(story_id uuid, title text, slug text, cover_url text, source_name text, pinned_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.id,
    COALESCE(NULLIF(btrim((SELECT sl.content FROM slides sl WHERE sl.story_id = s.id AND sl.slide_number = 1 LIMIT 1)), ''), s.title),
    s.slug, s.cover_illustration_url, cs.source_name, s.pinned_until
  FROM stories s
  JOIN topic_articles ta ON ta.id = s.topic_article_id
  JOIN topics t ON t.id = ta.topic_id
  LEFT JOIN content_sources cs ON cs.id = ta.source_id
  WHERE ta.topic_id = p_topic_id AND t.is_active = true
    AND (t.is_public = true OR public.can_manage_topic(t.id))
    AND s.pinned_until > now() AND s.is_published = true AND s.status IN ('published','ready')
  ORDER BY s.pinned_at DESC
  LIMIT 9;
$$;
REVOKE ALL ON FUNCTION public.get_topic_pinned_stories(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_topic_pinned_stories(uuid) TO anon, authenticated, service_role;