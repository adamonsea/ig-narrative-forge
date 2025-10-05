-- Fix the TK Maxx story with future date
UPDATE articles
SET published_at = '2024-08-20T00:00:00Z'
WHERE id = (
  SELECT article_id 
  FROM stories 
  WHERE id = '873613ad-150b-44ab-846f-31e1d69a35fa'
);