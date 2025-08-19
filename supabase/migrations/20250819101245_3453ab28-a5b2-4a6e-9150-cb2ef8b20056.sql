-- Reset the stuck Black Robin Farm story to draft status so it can be processed again
UPDATE stories 
SET status = 'draft' 
WHERE id = '962114d2-c31b-4192-bb03-11d0cc89ab52' 
AND status = 'processing';