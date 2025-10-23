-- Emergency fix: Drop broken function and recreate with correct schema
-- Problem: Function references non-existent tables (topic_stories, topic_story_keywords)
-- Solution: Recreate using correct tables (topic_articles, articles)

DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(uuid, text[], text[], text[], integer, integer) CASCADE;

-- Recreate with correct schema from migration 20251022175015
CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_id uuid,
  p_keywords text[] DEFAULT NULL::text[],
  p_source_domains text[] DEFAULT NULL::text[],
  p_mp_names text[] DEFAULT NULL::text[],
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  story_id uuid,
  story_title text,
  story_summary text,
  story_headline text,
  story_published_at timestamp with time zone,
  story_created_at timestamp with time zone,
  story_is_parliamentary boolean,
  source_name text,
  source_url text,
  source_domain text,
  slide_id uuid,
  slide_number integer,
  slide_content text,
  slide_type text,
  slide_image_url text,
  slide_alt_text text,
  article_url text,
  mp_name text,
  mp_party text,
  constituency text
)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH base_stories AS (
    SELECT DISTINCT
      s.id,
      s.title,
      s.summary,
      s.headline,
      s.published_at,
      s.created_at,
      COALESCE(s.is_parliamentary, false) as is_parliamentary,
      cs.name as source_name,
      cs.url as source_url,
      cs.domain as source_domain,
      sac.url as article_url
    FROM stories s
    INNER JOIN topic_articles ta ON ta.id = s.topic_article_id
    LEFT JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    LEFT JOIN content_sources cs ON cs.id = sac.source_id
    WHERE ta.topic_id = p_topic_id
      AND s.status = 'published'
      AND (p_keywords IS NULL OR ta.keyword_matches && p_keywords)
      AND (p_source_domains IS NULL OR cs.domain = ANY(p_source_domains))
      AND (p_mp_names IS NULL OR COALESCE(s.is_parliamentary, false) = true)
    ORDER BY s.published_at DESC
    LIMIT p_limit
    OFFSET p_offset
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
    WHERE pm.story_id IN (SELECT id FROM base_stories)
    GROUP BY pm.story_id
  )
  SELECT 
    bs.id as story_id,
    bs.title as story_title,
    bs.summary as story_summary,
    bs.headline as story_headline,
    bs.published_at as story_published_at,
    bs.created_at as story_created_at,
    bs.is_parliamentary as story_is_parliamentary,
    bs.source_name,
    bs.source_url,
    bs.source_domain,
    sl.id as slide_id,
    sl.slide_number,
    sl.content as slide_content,
    sl.type as slide_type,
    sl.image_url as slide_image_url,
    sl.alt_text as slide_alt_text,
    bs.article_url,
    mp.first_mp_name as mp_name,
    mp.first_party as mp_party,
    mp.first_constituency as constituency
  FROM base_stories bs
  LEFT JOIN slides sl ON sl.story_id = bs.id
  LEFT JOIN mp_aggregates mp ON mp.story_id = bs.id
  WHERE sl.id IS NOT NULL
    AND (p_mp_names IS NULL OR mp.all_mp_names && p_mp_names)
  ORDER BY bs.published_at DESC, sl.slide_number ASC;
END;
$function$;