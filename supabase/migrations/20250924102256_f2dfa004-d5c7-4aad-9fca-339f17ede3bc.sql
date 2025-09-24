-- Function to get legacy articles awaiting simplification (processed but no published story)
CREATE OR REPLACE FUNCTION public.get_legacy_articles_awaiting_simplification(p_topic_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
    SELECT COUNT(*)::integer
    FROM articles a
    WHERE a.topic_id = p_topic_id
      AND a.processing_status = 'processed'
      AND NOT EXISTS (
        SELECT 1 FROM stories s 
        WHERE s.article_id = a.id 
          AND s.is_published = true 
          AND s.status IN ('ready', 'published')
      )
  );
END;
$function$;

-- Function to get multi-tenant articles awaiting simplification (processed but no published story)
CREATE OR REPLACE FUNCTION public.get_multitenant_articles_awaiting_simplification(p_topic_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
    SELECT COUNT(*)::integer
    FROM topic_articles ta
    WHERE ta.topic_id = p_topic_id
      AND ta.processing_status = 'processed'
      AND NOT EXISTS (
        SELECT 1 FROM stories s 
        WHERE s.topic_article_id = ta.id 
          AND s.is_published = true 
          AND s.status IN ('ready', 'published')
      )
  );
END;
$function$;