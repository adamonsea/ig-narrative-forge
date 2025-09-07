-- Improve duplicate detection function with lower threshold and better logic
CREATE OR REPLACE FUNCTION public.detect_article_duplicates(p_article_id uuid)
 RETURNS TABLE(duplicate_id uuid, similarity_score numeric, detection_method text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Find duplicates based on exact URL match (highest priority)
  RETURN QUERY
  SELECT 
    a.id as duplicate_id,
    1.0::NUMERIC as similarity_score,
    'exact_url'::TEXT as detection_method
  FROM articles a
  WHERE a.id != p_article_id
    AND a.processing_status != 'discarded'
    AND a.source_url = (
      SELECT source_url 
      FROM articles 
      WHERE id = p_article_id
    );
  
  -- Find duplicates based on title similarity with improved normalization
  RETURN QUERY
  SELECT 
    a.id as duplicate_id,
    similarity(
      regexp_replace(lower(trim(a.title)), '[^\w\s]', '', 'g'),
      regexp_replace(lower(trim(ref.title)), '[^\w\s]', '', 'g')
    )::NUMERIC as similarity_score,
    'title_similarity'::TEXT as detection_method
  FROM articles a
  CROSS JOIN (
    SELECT title FROM articles WHERE id = p_article_id
  ) ref
  WHERE a.id != p_article_id
    AND a.processing_status != 'discarded'
    AND similarity(
      regexp_replace(lower(trim(a.title)), '[^\w\s]', '', 'g'),
      regexp_replace(lower(trim(ref.title)), '[^\w\s]', '', 'g')
    ) >= 0.6
  ORDER BY similarity_score DESC;
END;
$function$;