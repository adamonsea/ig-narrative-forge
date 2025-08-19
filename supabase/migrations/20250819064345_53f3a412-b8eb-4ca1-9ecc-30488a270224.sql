-- Add missing foreign key relationship between scrape_schedules and content_sources
ALTER TABLE scrape_schedules 
ADD CONSTRAINT fk_scrape_schedules_source_id 
FOREIGN KEY (source_id) REFERENCES content_sources(id) ON DELETE CASCADE;

-- Add missing foreign key relationship between scrape_jobs and content_sources
ALTER TABLE scrape_jobs 
ADD CONSTRAINT fk_scrape_jobs_source_id 
FOREIGN KEY (source_id) REFERENCES content_sources(id) ON DELETE CASCADE;

-- Add missing foreign key relationship between scrape_jobs and scrape_schedules
ALTER TABLE scrape_jobs 
ADD CONSTRAINT fk_scrape_jobs_schedule_id 
FOREIGN KEY (schedule_id) REFERENCES scrape_schedules(id) ON DELETE CASCADE;

-- Create initial schedules for existing active content sources
INSERT INTO scrape_schedules (source_id, schedule_type, frequency_hours, next_run_at)
SELECT 
  id as source_id,
  'twice_daily' as schedule_type,
  12 as frequency_hours,
  CASE 
    -- If current time is before 6 AM UTC, schedule for 6 AM today
    WHEN EXTRACT(hour FROM now() AT TIME ZONE 'UTC') < 6 THEN 
      date_trunc('day', now() AT TIME ZONE 'UTC') + interval '6 hours'
    -- If current time is before 6 PM UTC, schedule for 6 PM today
    WHEN EXTRACT(hour FROM now() AT TIME ZONE 'UTC') < 18 THEN 
      date_trunc('day', now() AT TIME ZONE 'UTC') + interval '18 hours'
    -- Otherwise schedule for 6 AM tomorrow
    ELSE 
      date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day' + interval '6 hours'
  END as next_run_at
FROM content_sources 
WHERE is_active = true 
  AND feed_url IS NOT NULL
ON CONFLICT (source_id) DO NOTHING;