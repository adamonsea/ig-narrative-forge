-- CRITICAL SECURITY FIX: Enable RLS on topics table
-- The topics table contains sensitive business data but RLS was disabled
-- This makes all topic data publicly accessible despite having policies

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

-- Verify the existing policies are still in place and will now be enforced:
-- 1. Topics viewable by creators and admins
-- 2. Users can create their own topics  
-- 3. Topic creators can update their topics
-- 4. Topic creators can delete their topics

-- Log this critical security fix
SELECT log_event(
  'error',
  'SECURITY FIX: Enabled RLS on topics table - was publicly accessible',
  jsonb_build_object(
    'table', 'topics',
    'vulnerability', 'rls_disabled_with_policies',
    'impact', 'business_data_exposed_publicly',
    'fix_applied', 'enabled_rls'
  ),
  'security_critical_fix'
);