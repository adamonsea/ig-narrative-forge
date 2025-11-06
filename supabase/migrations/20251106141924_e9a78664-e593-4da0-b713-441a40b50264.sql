-- Phase 1: Backfill scraping_config for Newsquest sources
UPDATE content_sources
SET scraping_config = jsonb_build_object(
  'sectionPath', regexp_replace(feed_url, '^https?://[^/]+', ''),
  'arcSite', CASE 
    WHEN canonical_domain = 'theargus.co.uk' THEN 'theargus'
    WHEN canonical_domain = 'sussexexpress.co.uk' THEN 'sussexexpress'
    WHEN canonical_domain = 'crawleyobserver.co.uk' THEN 'crawleyobserver'
    WHEN canonical_domain = 'brightonandhoveindependent.co.uk' THEN 'brightonandhoveindependent'
    ELSE split_part(canonical_domain, '.', 1)
  END,
  'arcCompatible', true,
  'backfilledAt', NOW()::text
)
WHERE canonical_domain IN (
  'theargus.co.uk', 
  'sussexexpress.co.uk', 
  'crawleyobserver.co.uk',
  'brightonandhoveindependent.co.uk'
)
AND feed_url IS NOT NULL
AND (scraping_config IS NULL OR scraping_config = '{}'::jsonb);

-- Phase 2: Sync topic_id from junction table to content_sources
UPDATE content_sources cs
SET topic_id = ts.topic_id
FROM topic_sources ts
WHERE cs.id = ts.source_id
AND cs.topic_id IS NULL
AND ts.is_active = true;

-- Phase 3: Deduplicate Argus sources
-- Remove duplicate: "theargus.co.uk" (66441926-8f9a-4c01-90d7-0b58971406e6)
-- Keep: "Argus - Eastbourne Local News" (16a372ff-8e02-41a4-abaa-fd24083c2e69)
DELETE FROM topic_sources 
WHERE source_id = '66441926-8f9a-4c01-90d7-0b58971406e6';

DELETE FROM content_sources 
WHERE id = '66441926-8f9a-4c01-90d7-0b58971406e6';

-- Phase 4: Create trigger function for automatic topic_id sync
CREATE OR REPLACE FUNCTION sync_content_sources_topic_id()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT: Set topic_id if source doesn't have one yet
  IF TG_OP = 'INSERT' THEN
    UPDATE content_sources 
    SET topic_id = NEW.topic_id 
    WHERE id = NEW.source_id 
    AND topic_id IS NULL;
    RETURN NEW;
  END IF;
  
  -- On DELETE: Clear topic_id if no other topic links exist
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM topic_sources 
      WHERE source_id = OLD.source_id 
      AND is_active = true
    ) THEN
      UPDATE content_sources 
      SET topic_id = NULL 
      WHERE id = OLD.source_id;
    END IF;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Create trigger on topic_sources junction table
DROP TRIGGER IF EXISTS sync_topic_id_on_junction_change ON topic_sources;
CREATE TRIGGER sync_topic_id_on_junction_change
AFTER INSERT OR DELETE ON topic_sources
FOR EACH ROW
EXECUTE FUNCTION sync_content_sources_topic_id();

-- Log the migration
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Applied comprehensive Newsquest source fix and prevention measures',
  jsonb_build_object(
    'migration', '20250118_fix_newsquest_sources',
    'actions', jsonb_build_array(
      'backfilled_scraping_config',
      'synced_topic_ids',
      'deduplicated_argus',
      'created_sync_trigger'
    )
  ),
  'migration'
);