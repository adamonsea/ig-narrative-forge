-- Reset the stuck Black Robin Farm story and add safety mechanism
UPDATE stories 
SET status = 'draft', updated_at = now()
WHERE id = '6f5fc597-6440-417c-84ba-9fec91a0afeb' 
AND status = 'processing';

-- Create a function to reset stalled processing stories automatically
CREATE OR REPLACE FUNCTION reset_stalled_stories()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reset_count integer;
BEGIN
  -- Reset stories stuck in processing for more than 5 minutes
  UPDATE stories 
  SET status = 'draft', 
      updated_at = now()
  WHERE status = 'processing' 
    AND updated_at < now() - interval '5 minutes';
    
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  
  -- Log the reset action if any stories were reset
  IF reset_count > 0 THEN
    INSERT INTO system_logs (level, message, context, function_name)
    VALUES (
      'info', 
      'Auto-reset stalled processing stories', 
      jsonb_build_object('reset_count', reset_count),
      'reset_stalled_stories'
    );
  END IF;
  
  RETURN reset_count;
END;
$$;