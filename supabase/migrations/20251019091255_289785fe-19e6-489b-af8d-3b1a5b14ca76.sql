-- Replace get_topic_stories_with_keywords with story-level pagination
-- This ensures each story returns ALL its slides, not just one per page

DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(text, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_slug text,
  p_keywords text[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  story_id uuid,
  story_title text,
  story_status text,
  story_is_published boolean,
  story_created_at timestamptz,
  story_cover_url text,
  article_id uuid,
  article_source_url text,
  article_published_at timestamptz,
  slide_id uuid,
  slide_number integer,
  slide_content text,
  content_type text,
  shared_content_id uuid
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH topic_info AS (
    SELECT id AS topic_id FROM topics WHERE lower(slug) = lower(p_topic_slug) AND is_active = true
  ),
  legacy_base AS (
    SELECT
      s.id AS story_id,
      s.title AS story_title,
      s.status AS story_status,
      s.is_published AS story_is_published,
      s.created_at AS story_created_at,
      s.cover_illustration_url AS story_cover_url,
      a.id AS article_id,
      a.source_url AS article_source_url,
      a.published_at AS article_published_at,
      NULL::uuid AS shared_content_id,
      'legacy'::text AS content_type
    FROM stories s
    JOIN articles a ON a.id = s.article_id
    WHERE a.topic_id = (SELECT topic_id FROM topic_info)
      AND s.is_published = true
      AND s.status IN ('ready','published')
      AND (p_sources IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_sources) src WHERE a.source_url ILIKE '%'||src||'%'
      ))
      AND (p_keywords IS NULL OR EXISTS (
        SELECT 1
        FROM slides sl
        WHERE sl.story_id = s.id
          AND EXISTS (SELECT 1 FROM unnest(p_keywords) kw WHERE sl.content ILIKE '%'||kw||'%')
      ))
  ),
  mt_base AS (
    SELECT
      s.id AS story_id,
      s.title AS story_title,
      s.status AS story_status,
      s.is_published AS story_is_published,
      s.created_at AS story_created_at,
      s.cover_illustration_url AS story_cover_url,
      NULL::uuid AS article_id,
      sac.url AS article_source_url,
      sac.published_at AS article_published_at,
      sac.id AS shared_content_id,
      'multitenant'::text AS content_type
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    WHERE ta.topic_id = (SELECT topic_id FROM topic_info)
      AND s.is_published = true
      AND s.status IN ('ready','published')
      AND (p_sources IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_sources) src WHERE sac.url ILIKE '%'||src||'%'
      ))
      AND (p_keywords IS NULL OR EXISTS (
        SELECT 1
        FROM slides sl
        WHERE sl.story_id = s.id
          AND EXISTS (SELECT 1 FROM unnest(p_keywords) kw WHERE sl.content ILIKE '%'||kw||'%')
      ))
  ),
  stories_union AS (
    SELECT * FROM legacy_base
    UNION
    SELECT * FROM mt_base
  ),
  story_page AS (
    SELECT su.*
    FROM stories_union su
    ORDER BY su.article_published_at DESC NULLS LAST, su.story_created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT
    sp.story_id,
    sp.story_title,
    sp.story_status,
    sp.story_is_published,
    sp.story_created_at,
    sp.story_cover_url,
    sp.article_id,
    sp.article_source_url,
    sp.article_published_at,
    sl.id AS slide_id,
    sl.slide_number,
    sl.content AS slide_content,
    sp.content_type,
    sp.shared_content_id
  FROM story_page sp
  JOIN slides sl ON sl.story_id = sp.story_id
  ORDER BY sp.article_published_at DESC NULLS LAST, sp.story_created_at DESC, sl.slide_number ASC;
END;
$$;