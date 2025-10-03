-- Create function to get all available filter options from the entire database
-- for a given topic, not just loaded stories
CREATE OR REPLACE FUNCTION get_topic_filter_options(p_topic_slug text)
RETURNS TABLE(
  filter_type text,
  filter_value text,
  count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH topic_info AS (
    SELECT id FROM topics WHERE slug = p_topic_slug
  ),
  -- Get all published stories for this topic (legacy path)
  legacy_stories AS (
    SELECT DISTINCT
      s.id as story_id,
      s.title,
      a.source_url,
      array_agg(DISTINCT sl.content) FILTER (WHERE sl.content IS NOT NULL) as slide_contents
    FROM stories s
    JOIN articles a ON a.id = s.article_id
    LEFT JOIN slides sl ON sl.story_id = s.id
    WHERE a.topic_id = (SELECT id FROM topic_info)
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
    GROUP BY s.id, s.title, a.source_url
  ),
  -- Get all published stories for this topic (multi-tenant path)
  multitenant_stories AS (
    SELECT DISTINCT
      s.id as story_id,
      s.title,
      sac.url as source_url,
      array_agg(DISTINCT sl.content) FILTER (WHERE sl.content IS NOT NULL) as slide_contents
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    LEFT JOIN slides sl ON sl.story_id = s.id
    WHERE ta.topic_id = (SELECT id FROM topic_info)
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
    GROUP BY s.id, s.title, sac.url
  ),
  -- Combine both paths
  all_stories AS (
    SELECT * FROM legacy_stories
    UNION ALL
    SELECT * FROM multitenant_stories
  ),
  -- Extract keywords from content
  keywords_extracted AS (
    SELECT DISTINCT
      lower(trim(word)) as keyword
    FROM all_stories,
    LATERAL unnest(
      regexp_split_to_array(
        lower(title || ' ' || array_to_string(slide_contents, ' ')),
        '\s+'
      )
    ) as word
    WHERE length(trim(word)) > 3  -- Only meaningful keywords
      AND trim(word) !~ '^[0-9]+$'  -- Not just numbers
      AND trim(word) !~ '[^a-z0-9\-]'  -- Alphanumeric only
  ),
  -- Count keyword occurrences
  keyword_counts AS (
    SELECT
      'keyword' as filter_type,
      ke.keyword as filter_value,
      COUNT(DISTINCT s.story_id) as count
    FROM keywords_extracted ke
    JOIN all_stories s ON (
      lower(s.title || ' ' || array_to_string(s.slide_contents, ' ')) LIKE '%' || ke.keyword || '%'
    )
    GROUP BY ke.keyword
    HAVING COUNT(DISTINCT s.story_id) >= 2  -- Only keywords appearing in 2+ stories
  ),
  -- Extract source domains
  source_counts AS (
    SELECT
      'source' as filter_type,
      regexp_replace(
        regexp_replace(source_url, '^https?://(www\.)?', '', 'i'),
        '/.*$',
        ''
      ) as filter_value,
      COUNT(DISTINCT story_id) as count
    FROM all_stories
    WHERE source_url IS NOT NULL
    GROUP BY filter_value
  )
  -- Combine and return
  SELECT * FROM keyword_counts
  UNION ALL
  SELECT * FROM source_counts
  ORDER BY count DESC, filter_value ASC
  LIMIT 500;  -- Reasonable limit to avoid overwhelming UI
END;
$$;