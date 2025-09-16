-- Fix Brighton feed visibility by making the topic public
-- This allows the Brighton stories to appear in the feed

UPDATE topics 
SET is_public = true 
WHERE id = '0dc1da67-2975-4a42-af18-556ecb286398';

-- Log the change
INSERT INTO system_logs (level, message, context, function_name, created_at)
VALUES (
  'info',
  'Made Brighton topic public to fix feed visibility',
  jsonb_build_object(
    'topic_id', '0dc1da67-2975-4a42-af18-556ecb286398',
    'reason', 'Stories not showing in feed due to is_public=false'
  ),
  'fix_brighton_feed_visibility',
  now()
);