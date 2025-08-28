-- Fix remaining RLS issues (skip the view table)

-- Fix feed_cta_configs RLS policies to prevent conflicts
DROP POLICY IF EXISTS "Feed CTA configs service role access" ON feed_cta_configs;
DROP POLICY IF EXISTS "Service role access for feed CTA configs" ON feed_cta_configs;

-- Create a single, non-conflicting service role policy
CREATE POLICY "Service role full access" ON feed_cta_configs
FOR ALL USING (auth.role() = 'service_role'::text);

-- Fix the topic-specific policy to handle null topic_id cases properly
DROP POLICY IF EXISTS "Topic owners can manage feed CTA configs" ON feed_cta_configs;
CREATE POLICY "Topic owners can manage feed CTA configs" ON feed_cta_configs
FOR ALL USING (
  (auth.uid() IS NOT NULL) AND (
    (topic_id IS NOT NULL AND topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    )) OR 
    has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Create function to re-score articles when keywords change
CREATE OR REPLACE FUNCTION rescore_articles_for_topic(p_topic_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update regional relevance scores for articles belonging to this topic
  UPDATE articles 
  SET updated_at = now(),
      processing_status = CASE 
        WHEN processing_status = 'discarded' THEN 'new'
        ELSE processing_status
      END
  WHERE topic_id = p_topic_id;
  
  -- Log the rescoring event
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Rescored articles for topic keyword update',
    jsonb_build_object('topic_id', p_topic_id),
    'rescore_articles_for_topic'
  );
END;
$$;