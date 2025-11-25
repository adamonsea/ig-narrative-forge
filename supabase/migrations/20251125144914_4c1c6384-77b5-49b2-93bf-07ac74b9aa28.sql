-- Fix get_topic_sources RPC to use content_sources.feed_url
-- This ensures that feed URL edits in the UI are actually used by the scraper

-- Drop the existing function first
DROP FUNCTION IF EXISTS public.get_topic_sources(uuid);

-- Recreate with the same signature but fixed COALESCE logic
CREATE FUNCTION public.get_topic_sources(p_topic_id uuid)
RETURNS TABLE (
  source_id uuid,
  source_name text,
  feed_url text,
  canonical_domain text,
  is_active boolean,
  source_type text,
  credibility_score numeric,
  success_rate numeric,
  articles_scraped integer,
  last_scraped_at timestamptz,
  scraping_method text,
  scrape_frequency_hours integer,
  source_config jsonb,
  last_failure_reason text,
  consecutive_failures integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ts.source_id,
    csb.source_name,
    -- CRITICAL FIX: Use content_sources.feed_url instead of falling back to domain
    COALESCE(
      ts.source_config->>'feed_url',    -- Override if set in topic config
      csb.feed_url,                      -- Use the actual content source feed_url
      'https://' || csb.canonical_domain -- Last resort fallback to domain
    ) as feed_url,
    csb.canonical_domain,
    ts.is_active,
    csb.source_type,
    csb.credibility_score,
    csb.success_rate,
    csb.articles_scraped,
    csb.last_scraped_at,
    csb.scraping_method,
    csb.scrape_frequency_hours,
    ts.source_config,
    csb.last_failure_reason,
    csb.consecutive_failures
  FROM topic_sources ts
  JOIN content_sources csb ON csb.id = ts.source_id
  WHERE ts.topic_id = p_topic_id
  ORDER BY csb.source_name;
END;
$$;