-- Drop existing function to avoid conflicts
DROP FUNCTION IF EXISTS public.get_topic_articles_multi_tenant(uuid,text,integer,integer);

-- Create function to retrieve multi-tenant articles for a topic
CREATE OR REPLACE FUNCTION public.get_topic_articles_multi_tenant(
  p_topic_id UUID,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  shared_content_id UUID,
  title TEXT,
  body TEXT,
  author TEXT,
  url TEXT,
  image_url TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  word_count INTEGER,
  processing_status TEXT,
  regional_relevance_score INTEGER,
  content_quality_score INTEGER,
  keyword_matches TEXT[],
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ta.id,
    ta.shared_content_id,
    sac.title,
    sac.body,
    sac.author,
    sac.url,
    sac.image_url,
    sac.published_at,
    sac.word_count,
    ta.processing_status,
    ta.regional_relevance_score,
    ta.content_quality_score,
    ta.keyword_matches,
    ta.created_at,
    ta.updated_at
  FROM topic_articles ta
  JOIN shared_article_content sac ON sac.id = ta.shared_content_id
  WHERE ta.topic_id = p_topic_id
    AND (p_status IS NULL OR ta.processing_status = p_status)
  ORDER BY ta.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;