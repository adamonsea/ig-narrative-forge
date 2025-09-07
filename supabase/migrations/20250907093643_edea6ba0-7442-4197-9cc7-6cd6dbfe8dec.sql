-- Create trigger to automatically grant region access when users create regional topics
-- and ensure the RLS policy properly handles topic-based source additions

-- First, create a function to grant region access for topic creators
CREATE OR REPLACE FUNCTION public.grant_region_access_for_topic()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is a regional topic, automatically grant the creator access to that region
  IF NEW.topic_type = 'regional' AND NEW.region IS NOT NULL THEN
    INSERT INTO public.user_regions (user_id, region)
    VALUES (NEW.created_by, NEW.region)
    ON CONFLICT (user_id, region) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS grant_region_access_on_topic_creation ON public.topics;
CREATE TRIGGER grant_region_access_on_topic_creation
  AFTER INSERT ON public.topics
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_region_access_for_topic();

-- Also grant region access for existing regional topics
INSERT INTO public.user_regions (user_id, region)
SELECT DISTINCT created_by, region 
FROM public.topics 
WHERE topic_type = 'regional' 
  AND region IS NOT NULL 
  AND created_by IS NOT NULL
ON CONFLICT (user_id, region) DO NOTHING;