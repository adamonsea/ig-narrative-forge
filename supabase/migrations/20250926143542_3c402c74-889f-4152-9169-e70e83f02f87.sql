-- Create topic membership record for topic creators to ensure explicit access
-- This fixes RLS violations by providing explicit owner access

INSERT INTO topic_memberships (topic_id, user_id, role)
SELECT 
  t.id,
  t.created_by,
  'owner'
FROM topics t
WHERE t.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM topic_memberships tm 
    WHERE tm.topic_id = t.id 
    AND tm.user_id = t.created_by
  )
ON CONFLICT (topic_id, user_id) DO NOTHING;