-- Reset stuck scrape jobs that have been running for more than 30 minutes
UPDATE scrape_jobs 
SET status = 'failed', 
    completed_at = now(), 
    error_message = 'Job timed out - automatically reset from stuck running status'
WHERE status = 'running' 
  AND started_at < now() - INTERVAL '30 minutes';

-- Create a function to automatically timeout stuck jobs
CREATE OR REPLACE FUNCTION cleanup_stuck_scrape_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  updated_count integer;
BEGIN
  -- Reset jobs stuck for more than 30 minutes
  UPDATE scrape_jobs 
  SET status = 'failed', 
      completed_at = now(), 
      error_message = 'Job automatically timed out after 30 minutes'
  WHERE status = 'running' 
    AND started_at < now() - INTERVAL '30 minutes';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  -- Log the cleanup if any jobs were reset
  IF updated_count > 0 THEN
    INSERT INTO system_logs (level, message, context, function_name)
    VALUES (
      'info', 
      'Automatically cleaned up stuck scrape jobs', 
      jsonb_build_object('jobs_reset', updated_count),
      'cleanup_stuck_scrape_jobs'
    );
  END IF;
  
  RETURN updated_count;
END;
$$;