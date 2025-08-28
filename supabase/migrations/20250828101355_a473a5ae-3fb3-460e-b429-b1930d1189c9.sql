-- Fix critical security issues: Enable RLS on tables that have policies but RLS is disabled
ALTER TABLE content_sources_basic ENABLE ROW LEVEL SECURITY;

-- Add basic RLS policy for content_sources_basic since it has no policies
CREATE POLICY "Content sources basic read for authenticated users"
  ON content_sources_basic
  FOR SELECT
  USING (auth.uid() IS NOT NULL);