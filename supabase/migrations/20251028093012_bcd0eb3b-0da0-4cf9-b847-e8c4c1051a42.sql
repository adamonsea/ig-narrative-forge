-- Drop the incorrect function
DROP FUNCTION IF EXISTS get_topic_source_stats(uuid);

-- Create corrected function that properly joins tables
CREATE OR REPLACE FUNCTION get_topic_source_stats(p_topic_id uuid)
RETURNS TABLE (
  source_id uuid,
  source_name text,
  feed_url text,
  canonical_domain text,
  is_active boolean,
  is_gathering boolean,
  stories_published_7d integer,
  stories_published_total integer,
  last_story_date timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id as source_id,
    cs.source_name,
    cs.feed_url,
    cs.canonical_domain,
    ts.is_active,
    COALESCE(
      EXISTS(
        SELECT 1 FROM scrape_jobs sj
        WHERE sj.source_id = cs.id
        AND sj.status = 'processing'
        AND sj.created_at > NOW() - INTERVAL '1 hour'
      ),
      false
    ) as is_gathering,
    COALESCE(
      (SELECT COUNT(*)::integer
       FROM stories s
       JOIN topic_articles ta ON ta.id = s.topic_article_id
       WHERE ta.source_id = cs.id
       AND ta.topic_id = p_topic_id
       AND s.is_published = true
       AND s.created_at >= NOW() - INTERVAL '7 days'),
      0
    ) as stories_published_7d,
    COALESCE(
      (SELECT COUNT(*)::integer
       FROM stories s
       JOIN topic_articles ta ON ta.id = s.topic_article_id
       WHERE ta.source_id = cs.id
       AND ta.topic_id = p_topic_id
       AND s.is_published = true),
      0
    ) as stories_published_total,
    (SELECT MAX(s.created_at)
     FROM stories s
     JOIN topic_articles ta ON ta.id = s.topic_article_id
     WHERE ta.source_id = cs.id
     AND ta.topic_id = p_topic_id
     AND s.is_published = true) as last_story_date
  FROM content_sources cs
  JOIN topic_sources ts ON ts.source_id = cs.id
  WHERE ts.topic_id = p_topic_id
  ORDER BY stories_published_7d DESC, cs.source_name ASC;
END;
$$;