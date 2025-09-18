-- Create RPC function to fetch topic stories server-side
CREATE OR REPLACE FUNCTION public.get_topic_stories(
  p_topic_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_sort_order text DEFAULT 'newest'
)
RETURNS TABLE(
  id uuid,
  article_id uuid,
  topic_article_id uuid,
  headline text,
  summary text,
  status text,
  is_published boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  slides jsonb,
  article_title text,
  article_author text,
  article_published_at timestamp with time zone,
  story_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sort_column text;
BEGIN
  -- Validate sort order
  IF p_sort_order = 'oldest' THEN
    sort_column := 'created_at ASC';
  ELSE
    sort_column := 'created_at DESC';
  END IF;

  -- Return stories from both legacy and multi-tenant sources
  RETURN QUERY EXECUTE format('
    WITH legacy_stories AS (
      SELECT 
        s.id,
        s.article_id,
        NULL::uuid as topic_article_id,
        s.headline,
        s.summary,
        s.status,
        s.is_published,
        s.created_at,
        s.updated_at,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              ''id'', sl.id,
              ''type'', sl.type,
              ''content'', sl.content,
              ''position'', sl.position,
              ''image_url'', sl.image_url,
              ''visual_description'', sl.visual_description
            ) ORDER BY sl.position
          ) FILTER (WHERE sl.id IS NOT NULL),
          ''[]''::jsonb
        ) as slides,
        a.title as article_title,
        a.author as article_author,
        a.published_at as article_published_at,
        ''legacy'' as story_type
      FROM stories s
      JOIN articles a ON a.id = s.article_id
      LEFT JOIN slides sl ON sl.story_id = s.id
      WHERE a.topic_id = $1
      GROUP BY s.id, s.article_id, s.headline, s.summary, s.status, s.is_published, 
               s.created_at, s.updated_at, a.title, a.author, a.published_at
    ),
    multi_tenant_stories AS (
      SELECT 
        s.id,
        s.article_id,
        ta.id as topic_article_id,
        s.headline,
        s.summary,
        s.status,
        s.is_published,
        s.created_at,
        s.updated_at,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              ''id'', sl.id,
              ''type'', sl.type,
              ''content'', sl.content,
              ''position'', sl.position,
              ''image_url'', sl.image_url,
              ''visual_description'', sl.visual_description
            ) ORDER BY sl.position
          ) FILTER (WHERE sl.id IS NOT NULL),
          ''[]''::jsonb
        ) as slides,
        sac.title as article_title,
        sac.author as article_author,
        sac.published_at as article_published_at,
        ''multi_tenant'' as story_type
      FROM stories s
      JOIN topic_articles ta ON ta.id = s.topic_article_id
      JOIN shared_article_content sac ON sac.id = ta.shared_content_id
      LEFT JOIN slides sl ON sl.story_id = s.id
      WHERE ta.topic_id = $1
      GROUP BY s.id, s.article_id, ta.id, s.headline, s.summary, s.status, s.is_published,
               s.created_at, s.updated_at, sac.title, sac.author, sac.published_at
    )
    SELECT * FROM legacy_stories
    UNION ALL
    SELECT * FROM multi_tenant_stories
    ORDER BY %s
    LIMIT $2 OFFSET $3
  ', sort_column)
  USING p_topic_id, p_limit, p_offset;
END;
$$;