-- Drop and recreate get_topic_stories_with_keywords with proper mp_names aggregation
DROP FUNCTION IF EXISTS public.get_topic_stories_with_keywords(text, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_slug text,
  p_keywords text[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  story_id uuid,
  story_title text,
  story_created_at timestamptz,
  cover_illustration_url text,
  slide_id uuid,
  slide_number integer,
  slide_content text,
  slide_type text,
  slide_image_url text,
  article_source_url text,
  article_published_at timestamptz,
  is_parliamentary boolean,
  mp_name text,
  mp_names text[],
  mp_party text,
  constituency text,
  keyword_matches text[],
  source_name text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_topic_id uuid;
BEGIN
  -- Look up topic ID by slug
  SELECT t.id INTO v_topic_id
  FROM topics t
  WHERE LOWER(t.slug) = LOWER(p_topic_slug)
  LIMIT 1;

  IF v_topic_id IS NULL THEN
    RAISE EXCEPTION 'Topic not found for slug: %', p_topic_slug;
  END IF;

  RETURN QUERY
  SELECT * FROM (
    -- Multi-tenant branch (stories via topic_articles)
    SELECT DISTINCT ON (s.id, sl.slide_number)
      s.id AS story_id,
      s.title AS story_title,
      s.created_at AS story_created_at,
      s.cover_illustration_url,
      sl.id AS slide_id,
      sl.slide_number,
      sl.content AS slide_content,
      sl.type AS slide_type,
      sl.image_url AS slide_image_url,
      sac.url AS article_source_url,
      sac.published_at AS article_published_at,
      COALESCE(
        (SELECT COUNT(*) > 0 
         FROM parliamentary_mentions pm3 
         WHERE pm3.story_id = s.id),
        false
      ) AS is_parliamentary,
      (SELECT TRIM(REGEXP_REPLACE(pm2.mp_name, '^[Rr]t\.?\s+[Hh]on\.?\s+|\s+[Mm][Pp]$', '', 'g'))
       FROM parliamentary_mentions pm2
       WHERE pm2.story_id = s.id
       ORDER BY pm2.created_at DESC
       LIMIT 1) AS mp_name,
      (SELECT array_agg(DISTINCT TRIM(REGEXP_REPLACE(pm2.mp_name, '^[Rr]t\.?\s+[Hh]on\.?\s+|\s+[Mm][Pp]$', '', 'g')))
       FROM parliamentary_mentions pm2
       WHERE pm2.story_id = s.id
       AND pm2.mp_name IS NOT NULL) AS mp_names,
      (SELECT pm2.mp_party
       FROM parliamentary_mentions pm2
       WHERE pm2.story_id = s.id
       ORDER BY pm2.created_at DESC
       LIMIT 1) AS mp_party,
      (SELECT pm2.constituency
       FROM parliamentary_mentions pm2
       WHERE pm2.story_id = s.id
       ORDER BY pm2.created_at DESC
       LIMIT 1) AS constituency,
      ta.keyword_matches,
      cs.name AS source_name
    FROM stories s
    INNER JOIN topic_articles ta ON ta.story_id = s.id
    INNER JOIN shared_article_content sac ON sac.id = ta.content_id
    LEFT JOIN content_sources cs ON cs.id = sac.source_id
    LEFT JOIN slides sl ON sl.story_id = s.id
    WHERE ta.topic_id = v_topic_id
      AND s.status = 'published'
      AND (p_keywords IS NULL OR ta.keyword_matches && p_keywords)
      AND (p_sources IS NULL OR 
           EXISTS (
             SELECT 1 
             FROM unnest(p_sources) AS src
             WHERE sac.url ILIKE '%' || src || '%'
           ))

    UNION ALL

    -- Legacy branch (stories via articles table)
    SELECT DISTINCT ON (s.id, sl.slide_number)
      s.id AS story_id,
      s.title AS story_title,
      s.created_at AS story_created_at,
      s.cover_illustration_url,
      sl.id AS slide_id,
      sl.slide_number,
      sl.content AS slide_content,
      sl.type AS slide_type,
      sl.image_url AS slide_image_url,
      a.source_url AS article_source_url,
      a.published_at AS article_published_at,
      COALESCE(
        (SELECT COUNT(*) > 0 
         FROM parliamentary_mentions pm3 
         WHERE pm3.story_id = s.id),
        false
      ) AS is_parliamentary,
      (SELECT TRIM(REGEXP_REPLACE(pm2.mp_name, '^[Rr]t\.?\s+[Hh]on\.?\s+|\s+[Mm][Pp]$', '', 'g'))
       FROM parliamentary_mentions pm2
       WHERE pm2.story_id = s.id
       ORDER BY pm2.created_at DESC
       LIMIT 1) AS mp_name,
      (SELECT array_agg(DISTINCT TRIM(REGEXP_REPLACE(pm2.mp_name, '^[Rr]t\.?\s+[Hh]on\.?\s+|\s+[Mm][Pp]$', '', 'g')))
       FROM parliamentary_mentions pm2
       WHERE pm2.story_id = s.id
       AND pm2.mp_name IS NOT NULL) AS mp_names,
      (SELECT pm2.mp_party
       FROM parliamentary_mentions pm2
       WHERE pm2.story_id = s.id
       ORDER BY pm2.created_at DESC
       LIMIT 1) AS mp_party,
      (SELECT pm2.constituency
       FROM parliamentary_mentions pm2
       WHERE pm2.story_id = s.id
       ORDER BY pm2.created_at DESC
       LIMIT 1) AS constituency,
      ARRAY[]::text[] AS keyword_matches,
      '' AS source_name
    FROM stories s
    INNER JOIN articles a ON a.id = s.article_id
    LEFT JOIN slides sl ON sl.story_id = s.id
    WHERE s.topic_id = v_topic_id
      AND s.status = 'published'
      AND NOT EXISTS (
        SELECT 1 FROM topic_articles ta2 WHERE ta2.story_id = s.id
      )
      AND (p_keywords IS NULL OR 
           s.title ILIKE ANY(SELECT '%' || kw || '%' FROM unnest(p_keywords) AS kw))
      AND (p_sources IS NULL OR 
           EXISTS (
             SELECT 1 
             FROM unnest(p_sources) AS src
             WHERE a.source_url ILIKE '%' || src || '%'
           ))
  ) combined
  ORDER BY 
    COALESCE(combined.article_published_at, combined.story_created_at) DESC,
    combined.slide_number ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;