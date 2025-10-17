-- Create function to fetch published stories for sitemap
CREATE OR REPLACE FUNCTION public.get_published_stories_for_sitemap()
RETURNS TABLE (
  story_id uuid,
  title text,
  updated_at timestamp with time zone,
  topic_slug text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  -- Get stories from legacy architecture (article_id)
  SELECT 
    s.id as story_id,
    s.title,
    s.updated_at,
    t.slug as topic_slug
  FROM stories s
  JOIN articles a ON a.id = s.article_id
  JOIN topics t ON t.id = a.topic_id
  WHERE s.is_published = true
    AND s.status IN ('ready', 'published')
    AND t.is_active = true
    AND t.is_public = true
    AND t.slug IS NOT NULL
  
  UNION ALL
  
  -- Get stories from multi-tenant architecture (topic_article_id)
  SELECT 
    s.id as story_id,
    s.title,
    s.updated_at,
    t.slug as topic_slug
  FROM stories s
  JOIN topic_articles ta ON ta.id = s.topic_article_id
  JOIN topics t ON t.id = ta.topic_id
  WHERE s.is_published = true
    AND s.status IN ('ready', 'published')
    AND t.is_active = true
    AND t.is_public = true
    AND t.slug IS NOT NULL
  
  ORDER BY updated_at DESC;
END;
$function$;