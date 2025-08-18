-- Check current status constraint on stories table
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'public.stories'::regclass 
AND contype = 'c';