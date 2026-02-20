
-- Phase 1: Adaptive Strategy Memory + Quality Trend Tracking
-- Zero-risk additive columns only

-- 1. Adaptive Strategy Memory: remember what worked
ALTER TABLE public.content_sources
ADD COLUMN IF NOT EXISTS last_successful_method text,
ADD COLUMN IF NOT EXISTS last_method_execution_ms integer;

-- 2. Quality Trend Tracking: rolling quality metrics
ALTER TABLE public.content_sources
ADD COLUMN IF NOT EXISTS quality_metrics jsonb DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.content_sources.last_successful_method IS 'Last scraping method that succeeded - used to fast-track strategy selection';
COMMENT ON COLUMN public.content_sources.last_method_execution_ms IS 'Execution time of last successful scrape in milliseconds';
COMMENT ON COLUMN public.content_sources.quality_metrics IS 'Rolling quality metrics: avg_word_count, duplicate_rate, paywall_rate, snippet_rate, last_updated';
