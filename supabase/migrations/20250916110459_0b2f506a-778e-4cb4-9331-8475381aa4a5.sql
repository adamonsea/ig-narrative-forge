-- Phase 1 Fix: Handle Argus consolidation safely and fix content monitor

-- First, transfer any articles from the duplicate source to the main source
UPDATE articles 
SET source_id = '16a372ff-8e02-41a4-abaa-fd24083c2e69'
WHERE source_id = '10c6ff62-c84a-4ad1-b3d0-4b911ce86474';

-- Transfer any topic_articles references
UPDATE topic_articles 
SET source_id = '16a372ff-8e02-41a4-abaa-fd24083c2e69'
WHERE source_id = '10c6ff62-c84a-4ad1-b3d0-4b911ce86474';

-- Transfer any scraped_urls_history
UPDATE scraped_urls_history 
SET source_id = '16a372ff-8e02-41a4-abaa-fd24083c2e69'
WHERE source_id = '10c6ff62-c84a-4ad1-b3d0-4b911ce86474';

-- Transfer daily_content_availability records
UPDATE daily_content_availability 
SET source_id = '16a372ff-8e02-41a4-abaa-fd24083c2e69'
WHERE source_id = '10c6ff62-c84a-4ad1-b3d0-4b911ce86474';

-- Now safe to remove the duplicate Argus source and its topic associations
DELETE FROM topic_sources WHERE source_id = '10c6ff62-c84a-4ad1-b3d0-4b911ce86474';
DELETE FROM content_sources WHERE id = '10c6ff62-c84a-4ad1-b3d0-4b911ce86474';

-- Update the main Argus source to use Eastbourne index page
UPDATE content_sources 
SET 
  feed_url = 'https://www.theargus.co.uk/local-news/eastbourne-news/',
  source_name = 'Argus - Eastbourne Local News'
WHERE id = '16a372ff-8e02-41a4-abaa-fd24083c2e69';

-- Add topic_relevant_urls column to daily_content_availability table
ALTER TABLE daily_content_availability 
ADD COLUMN IF NOT EXISTS topic_relevant_urls INTEGER DEFAULT 0;

-- Update existing records to have topic_relevant_urls = total_urls_discovered for now
UPDATE daily_content_availability 
SET topic_relevant_urls = total_urls_discovered 
WHERE topic_relevant_urls IS NULL OR topic_relevant_urls = 0;

-- Add index for better performance on the upsert conflict resolution
CREATE INDEX IF NOT EXISTS idx_daily_content_availability_unique 
ON daily_content_availability (topic_id, source_id, check_date);