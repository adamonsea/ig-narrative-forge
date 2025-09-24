-- Update RLS policy to make active topics automatically public
DROP POLICY IF EXISTS "Public topics viewable by all" ON public.topics;

-- Create new policy: Active topics are automatically public
CREATE POLICY "Active topics are publicly viewable" 
ON public.topics 
FOR SELECT 
USING (is_active = true);

-- Create trigger function to automatically set is_public=true when is_active=true
CREATE OR REPLACE FUNCTION public.auto_publish_active_topics()
RETURNS TRIGGER AS $$
BEGIN
  -- When a topic is made active, automatically make it public
  IF NEW.is_active = true THEN
    NEW.is_public = true;
  END IF;
  
  -- When a topic is made inactive, keep is_public unchanged (user choice)
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on topics table
DROP TRIGGER IF EXISTS auto_publish_active_topics_trigger ON public.topics;
CREATE TRIGGER auto_publish_active_topics_trigger
  BEFORE INSERT OR UPDATE ON public.topics
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_publish_active_topics();

-- Fix existing topics: make all active topics public
UPDATE public.topics 
SET is_public = true, updated_at = now()
WHERE is_active = true AND is_public = false;