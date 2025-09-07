-- Fix RLS policies for content_sources to allow users to add sources to their own topics

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Content sources admin access" ON content_sources;
DROP POLICY IF EXISTS "Content sources admin full access" ON content_sources;

-- Recreate admin policies with proper naming
CREATE POLICY "content_sources_admin_all_access" ON content_sources
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow users to insert sources for topics they own or regions they have access to
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
      -- For regional topics: user has access to the region
      (region IS NOT NULL AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        EXISTS (
          SELECT 1 FROM user_regions 
          WHERE user_id = auth.uid() 
          AND user_regions.region = content_sources.region
        )
      ))
    )
  );

-- Allow users to update sources for topics they own or regions they have access to  
CREATE POLICY "content_sources_user_update" ON content_sources
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL AND (
      -- For keyword topics: user owns the topic
      (topic_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM topics 
        WHERE id = content_sources.topic_id 
        AND created_by = auth.uid()
      )) OR
      -- For regional topics: user has access to the region
      (region IS NOT NULL AND (
        has_role(auth.uid(), 'admin'::app_role) OR
        EXISTS (
          SELECT 1 FROM user_regions 
          WHERE user_id = auth.uid() 
          AND user_regions.region = content_sources.region
        )
      )) OR
      -- Admins can update everything
      has_role(auth.uid(), 'admin'::app_role)
    )
  );