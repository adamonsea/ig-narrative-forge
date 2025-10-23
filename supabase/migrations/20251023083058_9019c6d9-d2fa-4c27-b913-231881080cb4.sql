-- Force replace the RPC by dropping the current definition first, then recreating the canonical implementation
DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(uuid, text[], text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_id uuid,
  p_keywords text[] DEFAULT NULL,
  p_source_domains text[] DEFAULT NULL,
  p_mp_names text[] DEFAULT NULL,
  p_limit integer DEFAULT 40,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  story_id uuid,
  story_title text,
  story_status text,
  story_is_published boolean,
  story_is_parliamentary boolean,
  story_created_at timestamptz,
  story_cover_url text,
  article_id uuid,
  article_source_url text,
  article_published_at timestamptz,
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
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
        p_keywords IS NULL OR EXISTS (
          SELECT 1 FROM unnest(p_keywords) kw
          WHERE a.title ILIKE '%' || kw || '%'
             OR a.body ILIKE '%' || kw || '%'
        )
      )
      AND (
        p_source_domains IS NULL OR EXISTS (
          SELECT 1 FROM unnest(p_source_domains) sd
          WHERE a.source_url ILIKE '%' || sd || '%'
        )
      )
      AND (
        p_mp_names IS NULL OR COALESCE(s.is_parliamentary, false) = true
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
        p_keywords IS NULL OR (ta.keyword_matches && p_keywords)
      )
      AND (
        p_source_domains IS NULL OR EXISTS (
          SELECT 1 FROM unnest(p_source_domains) sd
          WHERE sac.source_domain ILIKE '%' || sd || '%'
        )
      )
      AND (
        p_mp_names IS NULL OR COALESCE(s.is_parliamentary, false) = true
      )
    ORDER BY s.id, sl.id, pm.created_at DESC
  ),
  base_union AS (
    SELECT * FROM legacy_stories
    UNION ALL
    SELECT * FROM multitenant_stories
  ),
  mp_aggregates AS (
    SELECT 
      pm.story_id,
      ARRAY_AGG(DISTINCT TRIM(REGEXP_REPLACE(pm.mp_name, '^[Rr]t\.?\s+[Hh]on\.?\s+|\s+[Mm][Pp]$', '', 'g'))) 
        FILTER (WHERE pm.mp_name IS NOT NULL) as all_mp_names,
      (ARRAY_AGG(pm.mp_name ORDER BY pm.created_at))[1] as first_mp_name,
      (ARRAY_AGG(pm.party ORDER BY pm.created_at))[1] as first_party,
      (ARRAY_AGG(pm.constituency ORDER BY pm.created_at))[1] as first_constituency
    FROM parliamentary_mentions pm
    WHERE pm.story_id IN (SELECT story_id FROM base_union)
    GROUP BY pm.story_id
  )
  SELECT 
    bu.story_id,
    bu.story_title,
    bu.story_status,
    bu.story_is_published,
    bu.story_is_parliamentary,
    bu.story_created_at,
    bu.story_cover_url,
    bu.article_id,
    bu.article_source_url,
    bu.article_published_at,
    bu.slide_id,
    bu.slide_number,
    bu.slide_content,
    bu.content_type,
    bu.shared_content_id,
    mp.first_mp_name as mp_name,
    mp.first_party as mp_party,
    mp.first_constituency as constituency
  FROM base_union bu
  LEFT JOIN mp_aggregates mp ON mp.story_id = bu.story_id
  WHERE bu.slide_id IS NOT NULL
    AND (p_mp_names IS NULL OR mp.all_mp_names && p_mp_names)
  ORDER BY bu.story_created_at DESC, bu.slide_number ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
