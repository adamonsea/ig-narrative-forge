-- Disable legacy eezee-automation-service cron jobs
-- These were calling the broken service and causing articles to be auto-discarded

SELECT cron.unschedule('eezee-automation-daily');
SELECT cron.unschedule('eezee-automation-12h');
SELECT cron.unschedule('eezee-automation-6hourly');

-- Re-enable Eastbourne topic automation (using the new universal-topic-automation system)
UPDATE topic_automation_settings
SET is_active = true
WHERE topic_id = (SELECT id FROM topics WHERE name = 'Eastbourne');