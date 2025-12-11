-- Allow anyone to read insight settings for public, active topics
CREATE POLICY "Anyone can read insight settings for public topics"
ON public.topic_insight_settings
FOR SELECT
USING (
  topic_id IN (
    SELECT id FROM topics 
    WHERE is_active = true AND is_public = true
  )
);