-- Fix add_source_to_topic to raise errors instead of silently returning false
CREATE OR REPLACE FUNCTION public.add_source_to_topic(
  p_topic_id UUID,
  p_source_id UUID,
  p_source_config JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate inputs
  IF p_topic_id IS NULL OR p_source_id IS NULL THEN
    RAISE EXCEPTION 'topic_id and source_id are required';
  END IF;

  -- Check if topic exists
  IF NOT EXISTS (SELECT 1 FROM topics WHERE id = p_topic_id) THEN
    RAISE EXCEPTION 'Topic with id % does not exist', p_topic_id;
  END IF;

  -- Check if source exists
  IF NOT EXISTS (SELECT 1 FROM content_sources WHERE id = p_source_id) THEN
    RAISE EXCEPTION 'Source with id % does not exist', p_source_id;
  END IF;

  -- Insert or update the junction table entry
  INSERT INTO topic_sources (topic_id, source_id, source_config, is_active)
  VALUES (p_topic_id, p_source_id, p_source_config, true)
  ON CONFLICT (topic_id, source_id) 
  DO UPDATE SET 
    is_active = true,
    source_config = EXCLUDED.source_config,
    updated_at = now();
  
  RETURN true;
END;
$$;