-- Phase 1: Safety & Cleanup - Automated maintenance jobs

-- Enable required extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create cleanup function for old system logs (30-day retention)
CREATE OR REPLACE FUNCTION cleanup_old_system_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM system_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % old system_logs entries', deleted_count;
  
  -- Log the cleanup operation
  INSERT INTO system_logs (log_type, message, metadata)
  VALUES (
    'cleanup',
    'Automated cleanup of old system logs',
    jsonb_build_object('deleted_count', deleted_count, 'retention_days', 30)
  );
END;
$$;

-- Create cleanup function for old scraped URL history (7-day retention)
CREATE OR REPLACE FUNCTION cleanup_old_scraped_urls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM scraped_urls_history
  WHERE scraped_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % old scraped_urls_history entries', deleted_count;
  
  -- Log the cleanup operation
  INSERT INTO system_logs (log_type, message, metadata)
  VALUES (
    'cleanup',
    'Automated cleanup of old scraped URLs history',
    jsonb_build_object('deleted_count', deleted_count, 'retention_days', 7)
  );
END;
$$;

-- Schedule cleanup-temp-uploads to run daily at 3 AM with 48hr retention
SELECT cron.schedule(
  'cleanup-temp-uploads-daily',
  '0 3 * * *', -- 3 AM daily
  $$
  SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/cleanup-temp-uploads',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI"}'::jsonb,
    body := '{"maxAgeHours": 48, "dryRun": false}'::jsonb
  ) as request_id;
  $$
);

-- Schedule system_logs cleanup to run daily at 3:15 AM
SELECT cron.schedule(
  'cleanup-system-logs-daily',
  '15 3 * * *', -- 3:15 AM daily
  $$
  SELECT cleanup_old_system_logs();
  $$
);

-- Schedule scraped_urls_history cleanup to run daily at 3:30 AM
SELECT cron.schedule(
  'cleanup-scraped-urls-daily',
  '30 3 * * *', -- 3:30 AM daily
  $$
  SELECT cleanup_old_scraped_urls();
  $$
);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION cleanup_old_system_logs() TO postgres;
GRANT EXECUTE ON FUNCTION cleanup_old_scraped_urls() TO postgres;