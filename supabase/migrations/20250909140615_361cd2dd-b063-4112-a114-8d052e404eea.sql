-- Create function to queue multi-tenant articles for content generation
CREATE OR REPLACE FUNCTION public.queue_multi_tenant_article(
  p_ai_provider TEXT DEFAULT 'deepseek',
  p_shared_content_id UUID,
  p_slidetype TEXT DEFAULT 'tabloid',
  p_tone tone_type DEFAULT 'conversational',
  p_writing_style TEXT DEFAULT 'journalistic'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  queue_id UUID;
  topic_article_id UUID;
BEGIN
  -- Get the topic_article_id for this shared content
  SELECT ta.id INTO topic_article_id
  FROM topic_articles ta
  WHERE ta.shared_content_id = p_shared_content_id
  AND ta.processing_status = 'new'
  LIMIT 1;
  
  IF topic_article_id IS NULL THEN
    RAISE EXCEPTION 'No valid topic article found for shared content ID: %', p_shared_content_id;
  END IF;
  
  -- Check if already queued
  IF EXISTS (
    SELECT 1 FROM content_generation_queue 
    WHERE shared_content_id = p_shared_content_id 
    AND status IN ('pending', 'processing')
  ) THEN
    RAISE EXCEPTION 'Article already queued for generation';
  END IF;
  
  -- Update topic article status to processed
  UPDATE topic_articles 
  SET processing_status = 'processed',
      updated_at = NOW()
  WHERE id = topic_article_id;
  
  -- Add to generation queue
  INSERT INTO content_generation_queue (
    shared_content_id,
    topic_article_id,
    slidetype,
    tone,
    writing_style,
    ai_provider,
    status,
    created_at
  ) VALUES (
    p_shared_content_id,
    topic_article_id,
    p_slidetype,
    p_tone,
    p_writing_style,
    p_ai_provider,
    'pending',
    NOW()
  ) RETURNING id INTO queue_id;
  
  RETURN queue_id::TEXT;
END;
$$;