-- Phase 2: Fix RPC to use UNION instead of UNION ALL (prevents duplicate rows)
DROP FUNCTION IF EXISTS get_topic_stories_with_keywords(text, text[], text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_topic_stories_with_keywords(
  p_topic_slug text,
  p_keywords text[] DEFAULT NULL::text[],
  p_sources text[] DEFAULT NULL::text[],
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  story_id uuid,
  story_title text,
  story_status text,
  story_is_published boolean,
  story_created_at timestamp with time zone,
  story_cover_url text,
  article_id uuid,
  article_source_url text,
  article_published_at timestamp with time zone,
  slide_id uuid,
  slide_number integer,
  slide_content text,
  content_type text,
  shared_content_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH topic_info AS (
    SELECT t.id as topic_id FROM topics t WHERE t.slug = p_topic_slug
  ),
  -- Legacy stories path
  legacy_stories AS (
    SELECT DISTINCT
      s.id as story_id,
      s.title as story_title,
      s.status as story_status,
      s.is_published as story_is_published,
      s.created_at as story_created_at,
      s.cover_illustration_url as story_cover_url,
      a.id as article_id,
      a.source_url as article_source_url,
      a.published_at as article_published_at,
      sl.id as slide_id,
      sl.slide_number as slide_number,
      sl.content as slide_content,
      'legacy'::text as content_type,
      NULL::uuid as shared_content_id
    FROM stories s
    JOIN articles a ON a.id = s.article_id
    LEFT JOIN slides sl ON sl.story_id = s.id
    WHERE a.topic_id = (SELECT topic_id FROM topic_info)
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
      AND (p_keywords IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_keywords) kw 
        WHERE sl.content ILIKE '%' || kw || '%'
      ))
      AND (p_sources IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_sources) src
        WHERE a.source_url ILIKE '%' || src || '%'
      ))
  ),
  -- Multi-tenant stories path
  multitenant_stories AS (
    SELECT DISTINCT
      s.id as story_id,
      s.title as story_title,
      s.status as story_status,
      s.is_published as story_is_published,
      s.created_at as story_created_at,
      s.cover_illustration_url as story_cover_url,
      NULL::uuid as article_id,
      sac.url as article_source_url,
      sac.published_at as article_published_at,
      sl.id as slide_id,
      sl.slide_number as slide_number,
      sl.content as slide_content,
      'multitenant'::text as content_type,
      sac.id as shared_content_id
    FROM stories s
    JOIN topic_articles ta ON ta.id = s.topic_article_id
    JOIN shared_article_content sac ON sac.id = ta.shared_content_id
    LEFT JOIN slides sl ON sl.story_id = s.id
    WHERE ta.topic_id = (SELECT topic_id FROM topic_info)
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
      AND (p_keywords IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_keywords) kw 
        WHERE sl.content ILIKE '%' || kw || '%'
      ))
      AND (p_sources IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_sources) src
        WHERE sac.url ILIKE '%' || src || '%'
      ))
  ),
  -- Use UNION (not UNION ALL) to deduplicate automatically
  all_stories AS (
    SELECT * FROM legacy_stories
    UNION
    SELECT * FROM multitenant_stories
  )
  SELECT * FROM all_stories
  ORDER BY article_published_at DESC NULLS LAST, slide_number ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- Phase 3: Clean up any new hybrid stories created since last migration
UPDATE stories 
SET article_id = NULL 
WHERE article_id IS NOT NULL 
  AND topic_article_id IS NOT NULL;

-- Add constraint to prevent future hybrid stories
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_not_hybrid_check;
ALTER TABLE stories ADD CONSTRAINT stories_not_hybrid_check 
  CHECK (NOT (article_id IS NOT NULL AND topic_article_id IS NOT NULL));

-- Log the complete fix
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Complete hybrid story fix applied: RPC deduplicated, hybrids cleaned, constraint added',
  jsonb_build_object(
    'rpc_fixed', true,
    'constraint_added', true,
    'stories_cleaned', (SELECT COUNT(*) FROM stories WHERE article_id IS NULL AND topic_article_id IS NOT NULL),
    'migration_date', now()
  ),
  'complete_hybrid_story_fix'
);