CREATE OR REPLACE FUNCTION public.get_admin_slides_for_stories(p_story_ids uuid[])
RETURNS SETOF public.slides
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sl.*
  FROM public.slides sl
  JOIN public.stories s ON s.id = sl.story_id
  WHERE sl.story_id = ANY(p_story_ids)
    AND (
      public.has_role((SELECT auth.uid()), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.articles a
        JOIN public.topics t ON t.id = a.topic_id
        WHERE a.id = s.article_id AND t.created_by = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.topic_articles ta
        JOIN public.topics t ON t.id = ta.topic_id
        WHERE ta.id = s.topic_article_id AND t.created_by = (SELECT auth.uid())
      )
    )
  ORDER BY sl.story_id, sl.slide_number;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_slides_for_stories(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_slides_for_stories(uuid[]) TO service_role;