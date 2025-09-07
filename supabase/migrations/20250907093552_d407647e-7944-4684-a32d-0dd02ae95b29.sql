-- Fix RLS policy to allow topic creators to add sources to their own topics regardless of type

-- Update the INSERT policy to also allow topic creators for regional topics
DROP POLICY IF EXISTS "content_sources_user_insert" ON content_sources;

CREATE POLICY "content_sources_user_insert" ON content_sources
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      -- For keyword topics: user owns the topic
      (topic_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM topics 
        WHERE id = content_sources.topic_id 
        AND created_by = auth.uid()
      )) OR
      -- For regional sources without topic_id: user has region access OR is admin
      (topic_id IS NULL AND region IS NOT NULL AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        EXISTS (
          SELECT 1 FROM user_regions 
          WHERE user_id = auth.uid() 
          AND user_regions.region = content_sources.region
        )
      )) OR
      -- Allow admins to add any source
      has_role(auth.uid(), 'admin'::app_role)
    )
  );