
-- Fix the topic_sources config with the correct feed_url
UPDATE topic_sources 
SET source_config = jsonb_set(
  source_config, 
  '{feed_url}', 
  '"https://www.eastbourneunltd.co.uk/post/rss.xml"'
),
updated_at = NOW()
WHERE source_id = '6c311d0d-0f3d-44af-8b43-7c06313fdff3' 
AND topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';

-- Also deactivate the duplicate old Chamber source in topic_sources
UPDATE topic_sources 
SET is_active = false,
    updated_at = NOW()
WHERE source_id = '89e3ab52-2e57-435a-b4f9-f83a4b20e3af';
