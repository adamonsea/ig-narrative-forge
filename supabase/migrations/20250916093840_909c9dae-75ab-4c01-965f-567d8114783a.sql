-- Fix security warning: Set search_path for the trigger function
CREATE OR REPLACE FUNCTION update_daily_content_availability_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;