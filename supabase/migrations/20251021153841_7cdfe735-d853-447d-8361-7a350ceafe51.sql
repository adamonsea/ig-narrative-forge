-- Fix MP filtering by adding parliamentary mention data to get_topic_stories_with_keywords
-- This restores MP filtering functionality in feeds

DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(uuid, text[], text[], text[]);

CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_id uuid,
  p_keywords text[] DEFAULT ARRAY[]::text[],
  p_source_domains text[] DEFAULT ARRAY[]::text[],
  p_mp_names text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE (
  story_id uuid,
  story_title text,
  story_status text,
  story_is_published boolean,
  story_is_parliamentary boolean,
  story_created_at timestamp with time zone,
  story_cover_url text,
  article_id uuid,
  article_source_url text,
  article_published_at timestamp with time zone,
  slide_id uuid,
  slide_number integer,
  slide_content text,
  content_type text,
  shared_content_id uuid,
  mp_name text,
  mp_party text,
  constituency text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH legacy_stories AS (
    SELECT DISTINCT ON (s.id, sl.id)
      s.id as story_id,
      s.title as story_title,
      s.status as story_status,
      s.is_published as story_is_published,
      COALESCE(s.is_parliamentary, false) as story_is_parliamentary,
      s.created_at as story_created_at,
      s.cover_illustration_url as story_cover_url,
      a.id as article_id,
      a.source_url as article_source_url,
      a.published_at as article_published_at,
      sl.id as slide_id,
      sl.slide_number as slide_number,
      sl.content as slide_content,
      'legacy'::text as content_type,
      NULL::uuid as shared_content_id,
      pm.mp_name as mp_name,
      pm.party as mp_party,
      pm.constituency as constituency
    FROM stories s
    JOIN articles a ON a.id = s.article_id
    LEFT JOIN slides sl ON sl.story_id = s.id
    LEFT JOIN parliamentary_mentions pm ON pm.story_id = s.id
    WHERE a.topic_id = p_topic_id
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
      AND (
        cardinality(p_keywords) = 0
        OR EXISTS (
          SELECT 1 FROM unnest(p_keywords) kw
          WHERE a.title ILIKE '%' || kw || '%'
            OR a.body ILIKE '%' || kw || '%'
        )
      )
      AND (
        cardinality(p_source_domains) = 0
        OR EXISTS (
          SELECT 1 FROM unnest(p_source_domains) sd
          WHERE a.source_url ILIKE '%' || sd || '%'
        )
      )
      AND (
        cardinality(p_mp_names) = 0
        OR pm.mp_name = ANY(p_mp_names)
      )
    ORDER BY s.id, sl.id, pm.created_at DESC
  ),
  multitenant_stories AS (
    SELECT DISTINCT ON (s.id, sl.id)
      s.id as story_id,
      s.title as story_title,
      s.status as story_status,
      s.is_published as story_is_published,
      COALESCE(s.is_parliamentary, false) as story_is_parliamentary,
      s.created_at as story_created_at,
      s.cover_illustration_url as story_cover_url,
      NULL::uuid as article_id,
      sac.url as article_source_url,
      sac.published_at as article_published_at,
      sl.id as slide_id,
      sl.slide_number as slide_number,
      sl.content as slide_content,
      'multitenant'::text as content_type,
      sac.id as shared_content_id,
      pm.mp_name as mp_name,
      pm.party as mp_party,
      pm.constituency as constituency
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    LEFT JOIN slides sl ON sl.story_id = s.id
    LEFT JOIN parliamentary_mentions pm ON pm.story_id = s.id
    WHERE ta.topic_id = p_topic_id
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
      AND (
        cardinality(p_keywords) = 0
        OR ta.keyword_matches && p_keywords
      )
      AND (
        cardinality(p_source_domains) = 0
        OR EXISTS (
          SELECT 1 FROM unnest(p_source_domains) sd
          WHERE sac.source_domain ILIKE '%' || sd || '%'
        )
      )
      AND (
        cardinality(p_mp_names) = 0
        OR pm.mp_name = ANY(p_mp_names)
      )
    ORDER BY s.id, sl.id, pm.created_at DESC
  )
  SELECT * FROM legacy_stories
  UNION ALL
  SELECT * FROM multitenant_stories
  ORDER BY story_created_at DESC;
END;
$$;