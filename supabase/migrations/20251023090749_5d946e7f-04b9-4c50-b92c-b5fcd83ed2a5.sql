-- Fix ambiguous story_id reference in get_topic_stories_with_keywords RPC
-- This resolves the "column reference 'story_id' is ambiguous" error

CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_keyword_filters TEXT[] DEFAULT NULL,
  p_source_filters TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  story_id UUID,
  story_created_at TIMESTAMPTZ,
  story_updated_at TIMESTAMPTZ,
  story_title TEXT,
  story_author TEXT,
  story_publication_name TEXT,
  story_cover_illustration_url TEXT,
  story_cover_illustration_prompt TEXT,
  article_id UUID,
  article_source_url TEXT,
  article_published_at TIMESTAMPTZ,
  article_region TEXT,
  slide_id UUID,
  slide_number INTEGER,
  slide_content TEXT,
  slide_word_count INTEGER,
  is_parliamentary BOOLEAN,
  mp_name TEXT,
  pm_id UUID,
  pm_mp_id UUID,
  pm_vote_date DATE,
  pm_debate_date DATE,
  pm_summary TEXT,
  pm_relevance_score INTEGER,
  pm_created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_has_keyword_filters BOOLEAN := (p_keyword_filters IS NOT NULL AND array_length(p_keyword_filters, 1) > 0);
  v_has_source_filters BOOLEAN := (p_source_filters IS NOT NULL AND array_length(p_source_filters, 1) > 0);
BEGIN
  RETURN QUERY
  WITH base_union AS (
    SELECT DISTINCT
      s.id as story_id,
      s.created_at as story_created_at,
      s.updated_at as story_updated_at,
      s.title as story_title,
      s.author as story_author,
      s.publication_name as story_publication_name,
      s.cover_illustration_url as story_cover_illustration_url,
      s.cover_illustration_prompt as story_cover_illustration_prompt,
      ta.id as article_id,
      sac.source_url as article_source_url,
      sac.published_at as article_published_at,
      sac.region as article_region,
      FALSE as is_parliamentary,
      NULL::TEXT as mp_name,
      NULL::UUID as pm_id,
      NULL::UUID as pm_mp_id,
      NULL::DATE as pm_vote_date,
      NULL::DATE as pm_debate_date,
      NULL::TEXT as pm_summary,
      NULL::INTEGER as pm_relevance_score,
      NULL::TIMESTAMPTZ as pm_created_at
    FROM stories s
    JOIN topic_articles ta ON s.topic_article_id = ta.id
    JOIN shared_article_content sac ON ta.shared_content_id = sac.id
    WHERE ta.topic_id = p_topic_id
      AND ta.processing_status = 'processed'
      AND (NOT v_has_keyword_filters OR EXISTS (
        SELECT 1 FROM unnest(p_keyword_filters) kw
        WHERE s.title ILIKE '%' || kw || '%'
      ))
      AND (NOT v_has_source_filters OR EXISTS (
        SELECT 1 FROM unnest(p_source_filters) src
        WHERE sac.source_url ILIKE '%' || src || '%'
      ))
  ),
  parliamentary_data AS (
    SELECT
      pm.id as pm_id,
      pm.mp_id as pm_mp_id,
      pm.story_id as pm_story_id,
      pm.vote_date as pm_vote_date,
      pm.debate_date as pm_debate_date,
      pm.summary as pm_summary,
      pm.relevance_score as pm_relevance_score,
      pm.created_at as pm_created_at,
      mp.name as mp_name
    FROM parliamentary_mentions pm
    JOIN mps mp ON pm.mp_id = mp.id
    -- FIX: Use aliased subquery to avoid ambiguous column reference
    WHERE pm.story_id IN (SELECT bu2.story_id FROM base_union bu2)
      AND pm.relevance_score >= 30
  )
  SELECT
    bu.story_id,
    bu.story_created_at,
    bu.story_updated_at,
    bu.story_title,
    bu.story_author,
    bu.story_publication_name,
    bu.story_cover_illustration_url,
    bu.story_cover_illustration_prompt,
    bu.article_id,
    bu.article_source_url,
    bu.article_published_at,
    bu.article_region,
    sl.id as slide_id,
    sl.slide_number,
    sl.content as slide_content,
    sl.word_count as slide_word_count,
    bu.is_parliamentary,
    bu.mp_name,
    bu.pm_id,
    bu.pm_mp_id,
    bu.pm_vote_date,
    bu.pm_debate_date,
    bu.pm_summary,
    bu.pm_relevance_score,
    bu.pm_created_at
  FROM base_union bu
  LEFT JOIN slides sl ON sl.story_id = bu.story_id
  ORDER BY bu.story_created_at DESC, sl.slide_number ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';