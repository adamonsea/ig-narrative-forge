-- Add processing timeout mechanism
-- Update stories that have been stuck in processing for more than 10 minutes
UPDATE stories 
SET status = 'draft', 
    updated_at = now()
WHERE status = 'processing' 
  AND updated_at < now() - interval '10 minutes';

-- Create function to automatically reset stalled processing jobs
CREATE OR REPLACE FUNCTION reset_stalled_processing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Reset stories stuck in processing for more than 10 minutes
  UPDATE stories 
  SET status = 'draft', 
      updated_at = now()
  WHERE status = 'processing' 
    AND updated_at < now() - interval '10 minutes';
    
  -- Log the reset action
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info', 
    'Reset stalled processing jobs', 
    jsonb_build_object('reset_count', (SELECT count(*) FROM stories WHERE status = 'processing' AND updated_at < now() - interval '10 minutes')),
    'reset_stalled_processing'
  );
END;
$$;