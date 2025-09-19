-- Test the fixed RPC function
SELECT count(*) as total_stories FROM get_topic_stories('d224e606-1a4c-4713-8135-1d30e2d6d0c6'::uuid);

-- Also check if any stories exist for Eastbourne topic
SELECT 
  s.id,
  s.title,
  s.status,
  s.is_published,
  a.title as article_title
FROM stories s
LEFT JOIN articles a ON s.article_id = a.id
LEFT JOIN topic_articles ta ON s.topic_article_id = ta.id
WHERE (a.topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6' OR ta.topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6')
LIMIT 5;