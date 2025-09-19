-- Fix the get_topic_stories function with correct slides columns
DROP FUNCTION IF EXISTS get_topic_stories(text, text, integer, integer);

CREATE OR REPLACE FUNCTION get_topic_stories(
  p_topic_slug text,
  p_sort_by text DEFAULT 'newest',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  title text,
  author text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  article_id uuid,
  article_title text,
  article_author text,
  article_published_at timestamp with time zone,
  slides jsonb,
  story_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  topic_record RECORD;
  sort_column text;
BEGIN
  -- Get the topic by slug
  SELECT t.* INTO topic_record 
  FROM topics t 
  WHERE t.slug = p_topic_slug;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Validate sort order
  IF p_sort_by = 'oldest' THEN
    sort_column := 'created_at ASC';
  ELSE
    sort_column := 'created_at DESC';
  END IF;

  -- Return stories from both legacy and multi-tenant sources
  RETURN QUERY EXECUTE format('
    WITH legacy_stories AS (
      SELECT 
        s.id,
        s.title,
        s.author,
        s.created_at,
        s.updated_at,
        s.article_id,
        a.title as article_title,
        a.author as article_author,
        a.published_at as article_published_at,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              ''id'', sl.id,
              ''slide_number'', sl.slide_number,
              ''content'', sl.content,
              ''word_count'', sl.word_count,
              ''alt_text'', sl.alt_text,
              ''visual_prompt'', sl.visual_prompt
            ) ORDER BY sl.slide_number
          ) FILTER (WHERE sl.id IS NOT NULL),
          ''[]''::jsonb
        ) as slides,
        ''legacy'' as story_type
      FROM stories s
      JOIN articles a ON a.id = s.article_id
      LEFT JOIN slides sl ON sl.story_id = s.id
      WHERE a.topic_id = $1
        AND s.is_published = true
        AND s.status IN (''ready'', ''published'')
      GROUP BY s.id, s.title, s.author, s.created_at, s.updated_at, s.article_id,
               a.title, a.author, a.published_at
    ),
    multi_tenant_stories AS (
      SELECT 
        s.id,
        s.title,
        s.author,
        s.created_at,
        s.updated_at,
        s.article_id,
        sac.title as article_title,
        sac.author as article_author,
        sac.published_at as article_published_at,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              ''id'', sl.id,
              ''slide_number'', sl.slide_number,
              ''content'', sl.content,
              ''word_count'', sl.word_count,
              ''alt_text'', sl.alt_text,
              ''visual_prompt'', sl.visual_prompt
            ) ORDER BY sl.slide_number
          ) FILTER (WHERE sl.id IS NOT NULL),
          ''[]''::jsonb
        ) as slides,
        ''multi_tenant'' as story_type
      FROM stories s
      JOIN topic_articles ta ON ta.id = s.topic_article_id
      JOIN shared_article_content sac ON sac.id = ta.shared_content_id
      LEFT JOIN slides sl ON sl.story_id = s.id
      WHERE ta.topic_id = $1
        AND s.is_published = true
        AND s.status IN (''ready'', ''published'')
      GROUP BY s.id, s.title, s.author, s.created_at, s.updated_at, s.article_id,
               sac.title, sac.author, sac.published_at
    )
    SELECT * FROM legacy_stories
    UNION ALL
    SELECT * FROM multi_tenant_stories
    ORDER BY %s
    LIMIT $2 OFFSET $3
  ', sort_column)
  USING topic_record.id, p_limit, p_offset;
END;
$function$;