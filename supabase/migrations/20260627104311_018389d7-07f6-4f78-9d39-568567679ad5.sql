CREATE OR REPLACE FUNCTION public.get_public_story_by_slug_and_id(p_slug text, p_story_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result_data jsonb;
  topic_record RECORD;
BEGIN
  SELECT id, name, slug INTO topic_record
  FROM topics
  WHERE lower(slug) = lower(p_slug)
    AND is_active = true
    AND is_public = true
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  SELECT jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'author', s.author,
    'publication_name', s.publication_name,
    'cover_illustration_url', s.cover_illustration_url,
    'animated_illustration_url', s.animated_illustration_url,
    'created_at', s.created_at,
    'updated_at', s.updated_at,
    'shared_content_id', ta.shared_content_id,
    'slides', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sl.id,
          'slide_number', sl.slide_number,
          'content', sl.content,
          'word_count', sl.word_count
        ) ORDER BY sl.slide_number
      )
      FROM slides sl
      WHERE sl.story_id = s.id
    ),
    'article', jsonb_build_object(
      'source_url', COALESCE(sac.url, ''),
      'region', '',
      'published_at', sac.published_at
    )
  ) INTO result_data
  FROM stories s
  LEFT JOIN topic_articles ta ON ta.id = s.topic_article_id
  LEFT JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  WHERE s.id = p_story_id
    AND s.is_published = true
    AND s.status IN ('published', 'ready')
    AND ta.topic_id = topic_record.id;
  
  IF result_data IS NOT NULL THEN
    RETURN result_data;
  END IF;
  
  SELECT jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'author', s.author,
    'publication_name', s.publication_name,
    'cover_illustration_url', s.cover_illustration_url,
    'animated_illustration_url', s.animated_illustration_url,
    'created_at', s.created_at,
    'updated_at', s.updated_at,
    'shared_content_id', NULL,
    'slides', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sl.id,
          'slide_number', sl.slide_number,
          'content', sl.content,
          'word_count', sl.word_count
        ) ORDER BY sl.slide_number
      )
      FROM slides sl
      WHERE sl.story_id = s.id
    ),
    'article', jsonb_build_object(
      'source_url', COALESCE(a.source_url, ''),
      'region', COALESCE(a.region, ''),
      'published_at', a.published_at
    )
  ) INTO result_data
  FROM stories s
  LEFT JOIN articles a ON a.id = s.article_id
  WHERE s.id = p_story_id
    AND s.is_published = true
    AND s.status IN ('published', 'ready')
    AND a.topic_id = topic_record.id;
  
  RETURN result_data;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_story_by_slug_and_id(text, uuid) TO anon, authenticated;