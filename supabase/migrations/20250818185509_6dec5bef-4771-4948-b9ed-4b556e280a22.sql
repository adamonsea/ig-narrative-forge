-- Delete all stories that have no slides (failed content generation)
-- This will return their articles back to the validation queue
DELETE FROM stories 
WHERE id IN (
  SELECT s.id 
  FROM stories s 
  LEFT JOIN slides sl ON s.id = sl.story_id 
  GROUP BY s.id 
  HAVING COUNT(sl.id) = 0
);