-- Enable Row Level Security on topics table
-- This fixes the critical security issue where policies exist but RLS is disabled
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

-- Log this security fix
SELECT log_event('info', 'Enabled RLS on topics table to fix security vulnerability', 
  jsonb_build_object(
    'table', 'topics',
    'issue', 'policy_exists_rls_disabled',
    'fix', 'enabled_rls'
  ), 
  'security_fix'
);