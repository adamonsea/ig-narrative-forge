-- Phase 1: Restore source protection and refine deletion criteria
-- This migration prevents accidental deletion of sources linked to active topics

-- Add constraint to prevent deletion of sources linked to topics
-- We'll use a trigger instead of a foreign key constraint for better control
CREATE OR REPLACE FUNCTION prevent_source_deletion_if_linked()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM topic_sources 
    WHERE source_id = OLD.id 
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Cannot delete source: still linked to active topics. Remove topic associations first.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS check_source_links_before_delete ON content_sources;
CREATE TRIGGER check_source_links_before_delete
  BEFORE DELETE ON content_sources
  FOR EACH ROW
  EXECUTE FUNCTION prevent_source_deletion_if_linked();

-- Create a safe cleanup function that respects the new rules
CREATE OR REPLACE FUNCTION safe_cleanup_inactive_sources()
RETURNS TABLE(deleted_count integer, message text) AS $$
DECLARE
  v_deleted_count integer := 0;
BEGIN
  -- Only delete sources that meet ALL criteria:
  -- 1. is_active = false (explicitly disabled)
  -- 2. No active topic_sources links
  -- 3. Not scraped in >180 days (or never scraped)
  DELETE FROM content_sources
  WHERE id IN (
    SELECT cs.id 
    FROM content_sources cs
    LEFT JOIN topic_sources ts ON ts.source_id = cs.id AND ts.is_active = true
    WHERE cs.is_active = false
      AND ts.id IS NULL  -- No active topic links
      AND (
        cs.last_scraped_at IS NULL 
        OR cs.last_scraped_at < NOW() - INTERVAL '180 days'
      )
  );
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN QUERY SELECT v_deleted_count, 
    format('Safely deleted %s inactive sources with no topic links', v_deleted_count);
END;
$$ LANGUAGE plpgsql;

-- Log this migration
DO $$
BEGIN
  RAISE NOTICE 'Source protection enabled. Sources linked to active topics cannot be deleted.';
  RAISE NOTICE 'Use safe_cleanup_inactive_sources() function for cleanup.';
END $$;