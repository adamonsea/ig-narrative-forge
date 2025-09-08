-- Emergency Recovery Plan Phase 1: Fix Dead RSS Feeds (Corrected)

-- 1. Fix the dead BBC South East RSS feed
UPDATE content_sources 
SET feed_url = 'https://feeds.bbci.co.uk/news/england/rss.xml',
    updated_at = now()
WHERE feed_url = 'https://feeds.bbci.co.uk/news/england/south_east/rss.xml';

-- 2. Fix the malformed BBC URL 
UPDATE content_sources 
SET feed_url = 'https://feeds.bbci.co.uk/news/england/sussex/rss.xml',
    updated_at = now()
WHERE feed_url = 'https://Https://bbc.co.uk';

-- 3. Update BBC Sussex News to use working RSS feed
UPDATE content_sources 
SET feed_url = 'https://feeds.bbci.co.uk/news/england/sussex/rss.xml',
    updated_at = now()
WHERE source_name = 'BBC Sussex News' 
  AND feed_url = 'https://www.bbc.co.uk/news/england/sussex/';

-- 4. Reset success rates for sources we're fixing to give them a fresh start
UPDATE content_sources 
SET success_rate = 100.0,
    updated_at = now()
WHERE feed_url IN (
  'https://feeds.bbci.co.uk/news/england/rss.xml',
  'https://feeds.bbci.co.uk/news/england/sussex/rss.xml'
);

-- 5. Log the emergency recovery action
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Emergency Recovery Phase 1: Fixed dead RSS feeds and reset success rates',
  jsonb_build_object(
    'action', 'emergency_recovery_phase_1',
    'fixes_applied', array[
      'BBC South East RSS feed fixed',
      'Malformed BBC URL fixed', 
      'BBC Sussex News RSS feed fixed',
      'Success rates reset for fresh start'
    ]
  ),
  'emergency_recovery_plan'
);