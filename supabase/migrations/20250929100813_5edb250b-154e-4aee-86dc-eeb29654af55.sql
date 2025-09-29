-- Drop existing functions and recreate with month filtering
DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(text, text[], integer, integer);
DROP FUNCTION IF EXISTS public.get_public_topic_feed(text, integer, integer);

-- Add a function to check if a story is within the last month (visible)
CREATE OR REPLACE FUNCTION public.is_story_visible(story_updated_at timestamp with time zone)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT story_updated_at >= (CURRENT_DATE - INTERVAL '30 days');
$$;

-- Recreate get_topic_stories_with_keywords to filter out stories older than a month
CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_slug text,
  p_keywords text[] DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  title text,
  author text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  cover_illustration_url text,
  cover_illustration_prompt text,
  article_source_url text,
  article_published_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    COALESCE(sac.title, a.title) as title,
    COALESCE(sac.author, a.author) as author,
    s.created_at,
    s.updated_at,
    s.cover_illustration_url,
    s.cover_illustration_prompt,
    COALESCE(sac.url, a.source_url) as article_source_url,
    COALESCE(sac.published_at, a.published_at) as article_published_at
  FROM stories s
  LEFT JOIN topic_articles ta ON s.topic_article_id = ta.id
  LEFT JOIN shared_article_content sac ON ta.shared_content_id = sac.id
  LEFT JOIN articles a ON s.article_id = a.id
  JOIN topics t ON (
    (ta.topic_id = t.id) OR 
    (a.topic_id = t.id AND ta.id IS NULL)
  )
  WHERE t.slug = p_topic_slug
    AND s.is_published = true
    AND s.status IN ('ready', 'published')
    AND is_story_visible(s.updated_at) -- Only show stories from last month
    AND (
      p_keywords IS NULL OR 
      p_keywords = '{}' OR 
      (
        CASE 
          WHEN ta.id IS NOT NULL THEN ta.keyword_matches && p_keywords
          ELSE a.keywords && p_keywords OR EXISTS (
            SELECT 1 FROM unnest(p_keywords) kw 
            WHERE COALESCE(sac.title, a.title) ILIKE '%' || kw || '%' 
               OR COALESCE(sac.body, a.body) ILIKE '%' || kw || '%'
          )
        END
      )
    )
  ORDER BY s.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Recreate get_public_topic_feed to filter out stories older than a month
CREATE OR REPLACE FUNCTION public.get_public_topic_feed(
  p_topic_slug text,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  title text,
  author text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  cover_illustration_url text,
  cover_illustration_prompt text,
  article_source_url text,
  article_published_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    COALESCE(sac.title, a.title) as title,
    COALESCE(sac.author, a.author) as author,
    s.created_at,
    s.updated_at,
    s.cover_illustration_url,
    s.cover_illustration_prompt,
    COALESCE(sac.url, a.source_url) as article_source_url,
    COALESCE(sac.published_at, a.published_at) as article_published_at
  FROM stories s
  LEFT JOIN topic_articles ta ON s.topic_article_id = ta.id
  LEFT JOIN shared_article_content sac ON ta.shared_content_id = sac.id
  LEFT JOIN articles a ON s.article_id = a.id
  JOIN topics t ON (
    (ta.topic_id = t.id) OR 
    (a.topic_id = t.id AND ta.id IS NULL)
  )
  WHERE t.slug = p_topic_slug
    AND t.is_public = true
    AND s.is_published = true
    AND s.status IN ('ready', 'published')
    AND is_story_visible(s.updated_at) -- Only show stories from last month
  ORDER BY s.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;