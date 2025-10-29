-- Fix security warnings: Set search_path for cleanup functions
CREATE OR REPLACE FUNCTION cleanup_old_system_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM system_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % old system_logs entries', deleted_count;
  
  INSERT INTO system_logs (log_type, message, metadata)
  VALUES (
    'cleanup',
    'Automated cleanup of old system logs',
    jsonb_build_object('deleted_count', deleted_count, 'retention_days', 30)
  );
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_old_scraped_urls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM scraped_urls_history
  WHERE scraped_at < NOW() - INTERVAL '7 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Deleted % old scraped_urls_history entries', deleted_count;
  
  INSERT INTO system_logs (log_type, message, metadata)
  VALUES (
    'cleanup',
    'Automated cleanup of old scraped URLs history',
    jsonb_build_object('deleted_count', deleted_count, 'retention_days', 7)
  );
END;
$$;