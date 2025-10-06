-- Create a SECURITY DEFINER function to fetch public story data
-- This bypasses RLS to allow anonymous users to view shared story links
CREATE OR REPLACE FUNCTION public.get_public_story_by_slug_and_id(
  p_slug text,
  p_story_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_data jsonb;
  topic_record RECORD;
BEGIN
  -- First, get the topic by slug (case-insensitive)
  SELECT id, name, slug INTO topic_record
  FROM topics
  WHERE lower(slug) = lower(p_slug)
    AND is_active = true
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Try to fetch story with multi-tenant architecture first
  SELECT jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'author', s.author,
    'publication_name', s.publication_name,
    'cover_illustration_url', s.cover_illustration_url,
    'created_at', s.created_at,
    'updated_at', s.updated_at,
    'slides', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sl.id,
          'slide_number', sl.slide_number,
          'content', sl.content
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
    AND s.status IN ('ready', 'published')
    AND ta.topic_id = topic_record.id;
  
  -- If found via multi-tenant, return it
  IF result_data IS NOT NULL THEN
    RETURN result_data;
  END IF;
  
  -- Fall back to legacy architecture
  SELECT jsonb_build_object(
    'id', s.id,
    'title', s.title,
    'author', s.author,
    'publication_name', s.publication_name,
    'cover_illustration_url', s.cover_illustration_url,
    'created_at', s.created_at,
    'updated_at', s.updated_at,
    'slides', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sl.id,
          'slide_number', sl.slide_number,
          'content', sl.content
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
    AND s.status IN ('ready', 'published')
    AND a.topic_id = topic_record.id;
  
  RETURN result_data;
END;
$$;