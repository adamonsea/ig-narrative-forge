-- Temporarily disable RLS on topics to diagnose the issue
ALTER TABLE public.topics DISABLE ROW LEVEL SECURITY;

-- Check what topics exist in the database
SELECT id, name, created_by, is_public, created_at FROM public.topics;