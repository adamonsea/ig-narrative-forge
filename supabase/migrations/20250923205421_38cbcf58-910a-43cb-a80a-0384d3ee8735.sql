-- First, let me check current RLS policies for topics
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'topics';

-- Also check the get_topic_stories function
SELECT routine_name, routine_definition, routine_type 
FROM information_schema.routines 
WHERE routine_name = 'get_topic_stories';

-- Check current topics table structure and public topics
SELECT id, name, slug, is_public, is_active FROM topics WHERE is_active = true;