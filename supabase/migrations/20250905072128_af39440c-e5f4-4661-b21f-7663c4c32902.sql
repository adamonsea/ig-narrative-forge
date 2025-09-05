-- Create CRON job to run automated-scheduler every 6 hours
-- This will enable automatic overnight scraping as requested

-- First, create the CRON job to run the automated scheduler
SELECT cron.schedule(
    'automated-scraper', 
    '0 */6 * * *', -- Run every 6 hours (at 00:00, 06:00, 12:00, 18:00)
    $$
    select
      net.http_post(
          url:='https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/automated-scheduler',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.vQgVmLdy2_nu8EWq4TQfk8-jEIttI0d1Kht7Nsdv_v0"}'::jsonb,
          body:=concat('{"scheduled_run": true, "time": "', now(), '"}')::jsonb
      ) as request_id;
    $$
);

-- Also create a cleanup job to run once daily to clean old rate limits and logs
SELECT cron.schedule(
    'daily-cleanup',
    '0 2 * * *', -- Run at 2 AM daily
    $$
    -- Clean up old rate limits
    DELETE FROM newsletter_signup_rate_limits 
    WHERE window_start < now() - INTERVAL '24 hours';
    
    -- Clean up old system logs older than 30 days
    DELETE FROM system_logs 
    WHERE created_at < now() - INTERVAL '30 days';
    
    -- Clean up old scrape jobs older than 7 days
    DELETE FROM scrape_jobs 
    WHERE created_at < now() - INTERVAL '7 days';
    $$
);

-- Update article processing to be less restrictive with relevance scores
-- Lower the minimum threshold in the validation trigger
CREATE OR REPLACE FUNCTION public.validate_regional_relevance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  source_info RECORD;
  min_threshold INTEGER := 10; -- Lowered from 15 to be more permissive
BEGIN
  -- Get source information to determine thresholds
  SELECT source_type INTO source_info
  FROM content_sources 
  WHERE id = NEW.source_id;
  
  -- Calculate regional relevance score from import metadata
  IF NEW.import_metadata IS NOT NULL AND 
     (NEW.import_metadata->>'regional_relevance_score')::integer IS NOT NULL THEN
    NEW.regional_relevance_score := (NEW.import_metadata->>'regional_relevance_score')::integer;
  END IF;
  
  -- Set more permissive thresholds based on source type
  IF source_info.source_type = 'hyperlocal' THEN
    min_threshold := 5;   -- Very permissive for local sources
  ELSIF source_info.source_type = 'regional' THEN
    min_threshold := 15;  -- Moderate for regional sources
  ELSE
    min_threshold := 20;  -- Still reasonable for national sources
  END IF;
  
  -- Only reject articles with very low relevance
  IF NEW.regional_relevance_score < min_threshold AND NEW.processing_status = 'new' THEN
    -- Mark as discarded instead of inserting
    NEW.processing_status := 'discarded';
    -- Add rejection reason to metadata
    NEW.import_metadata := COALESCE(NEW.import_metadata, '{}')::jsonb || 
      jsonb_build_object(
        'rejection_reason', 'insufficient_regional_relevance', 
        'relevance_score', NEW.regional_relevance_score,
        'min_threshold', min_threshold,
        'source_type', source_info.source_type
      );
  END IF;
  
  RETURN NEW;
END;
$$;