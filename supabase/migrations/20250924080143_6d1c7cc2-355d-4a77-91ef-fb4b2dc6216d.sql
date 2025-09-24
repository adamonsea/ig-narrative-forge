-- Phase 2 continued: Create dedicated function for public feeds
CREATE OR REPLACE FUNCTION public.get_public_topic_feed(
  p_topic_slug text,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0,
  p_sort_by text DEFAULT 'newest'
)
RETURNS TABLE(
  id uuid,
  title text,
  author text,
  created_at timestamptz,
  updated_at timestamptz,
  cover_illustration_url text,
  cover_illustration_prompt text,
  article_source_url text,
  article_published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  topic_record RECORD;
  sort_column text;
BEGIN
  -- Get the public topic by slug
  SELECT t.* INTO topic_record 
  FROM topics t 
  WHERE t.slug = p_topic_slug 
  AND t.is_active = true 
  AND t.is_public = true;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Validate sort order
  IF p_sort_by = 'oldest' THEN
    sort_column := 'created_at ASC';
  ELSE
    sort_column := 'created_at DESC';
  END IF;

  -- Return published stories from this public topic only
  RETURN QUERY EXECUTE format('
    WITH all_topic_stories AS (
      -- Legacy stories
      SELECT 
        s.id,
        s.title,
        s.author,
        s.created_at,
        s.updated_at,
        s.cover_illustration_url,
        s.cover_illustration_prompt,
        a.source_url as article_source_url,
        a.published_at as article_published_at
      FROM stories s
      JOIN articles a ON a.id = s.article_id
      WHERE a.topic_id = $1
        AND s.is_published = true
        
      UNION ALL
      
      -- Multi-tenant stories
      SELECT 
        s.id,
        s.title,
        s.author,
        s.created_at,
        s.updated_at,
        s.cover_illustration_url,
        s.cover_illustration_prompt,
        sac.url as article_source_url,
        sac.published_at as article_published_at
      FROM stories s
      JOIN topic_articles ta ON ta.id = s.topic_article_id
      JOIN shared_article_content sac ON sac.id = ta.shared_content_id
      WHERE ta.topic_id = $1
        AND s.is_published = true
    )
    SELECT * FROM all_topic_stories
    ORDER BY %s
    LIMIT $2 OFFSET $3
  ', sort_column)
  USING topic_record.id, p_limit, p_offset;
END;
$$;