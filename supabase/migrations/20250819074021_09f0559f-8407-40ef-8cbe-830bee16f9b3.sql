-- Check what status values are allowed for stories table
DO $$
DECLARE
    constraint_def text;
BEGIN
    SELECT pg_get_constraintdef(oid)
    INTO constraint_def
    FROM pg_constraint
    WHERE conname = 'stories_status_check';
    
    RAISE NOTICE 'Stories status constraint: %', constraint_def;
END $$;

-- Also check what the posts table uses for status as a reference
SELECT DISTINCT status FROM posts;