-- Fix the get_public_topic_feed function to use correct column references
CREATE OR REPLACE FUNCTION public.get_public_topic_feed(topic_slug_param text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_sort_by text DEFAULT 'newest'::text)
 RETURNS TABLE(id uuid, title text, summary text, author text, created_at timestamp with time zone, updated_at timestamp with time zone, slides jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  topic_record RECORD;
  sort_order TEXT;
BEGIN
  -- Get topic info safely for public access
  SELECT t.id, t.name, t.description, t.topic_type, t.region
  INTO topic_record
  FROM safe_public_topics t
  WHERE t.slug = topic_slug_param 
    AND t.is_public = true 
    AND t.is_active = true;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Set sort order
  sort_order := CASE 
    WHEN p_sort_by = 'oldest' THEN 'ASC'
    ELSE 'DESC'
  END;
  
  -- Return published stories with slides for this topic
  RETURN QUERY EXECUTE format('
    SELECT DISTINCT
      s.id,
      COALESCE(sac.title, a.title) as title,
      COALESCE(a.summary, '''') as summary,
      COALESCE(sac.author, a.author) as author,
      s.created_at,
      s.updated_at,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            ''id'', sl.id,
            ''slide_number'', sl.slide_number,
            ''content'', sl.content,
            ''word_count'', sl.word_count,
            ''type'', sl.type,
            ''image_url'', sl.image_url,
            ''alt_text'', sl.alt_text
          ) ORDER BY sl.slide_number
        ) FILTER (WHERE sl.id IS NOT NULL),
        ''[]''::jsonb
      ) as slides
    FROM stories s
    LEFT JOIN topic_articles ta ON s.topic_article_id = ta.id AND ta.topic_id = $1
    LEFT JOIN shared_article_content sac ON ta.shared_content_id = sac.id
    LEFT JOIN articles a ON s.article_id = a.id AND (s.topic_article_id IS NULL AND a.topic_id = $1)
    LEFT JOIN slides sl ON sl.story_id = s.id
    WHERE s.is_published = true
      AND s.status IN (''ready'', ''published'')
      AND (
        (ta.id IS NOT NULL) OR 
        (s.topic_article_id IS NULL AND a.topic_id = $1)
      )
    GROUP BY s.id, sac.title, a.title, a.summary, sac.author, a.author, s.created_at, s.updated_at
    ORDER BY s.created_at %s
    LIMIT $2 OFFSET $3
  ', sort_order)
  USING topic_record.id, p_limit, p_offset;
END;
$function$;