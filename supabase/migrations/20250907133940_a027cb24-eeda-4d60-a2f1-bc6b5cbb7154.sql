-- First, clean up existing Eastbourne articles in Hastings pipeline and remove source reference
UPDATE articles 
SET processing_status = 'discarded',
    source_id = NULL,
    import_metadata = COALESCE(import_metadata, '{}')::jsonb || 
      jsonb_build_object(
        'discarded_reason', 'Misplaced article - primarily about Eastbourne',
        'cleaned_at', now(),
        'cleanup_function', 'migration_cleanup',
        'original_source_id', source_id
      )
WHERE topic_id IN (SELECT id FROM topics WHERE name LIKE '%Hastings%')
  AND (title ILIKE '%eastbourne%' OR body ILIKE '%eastbourne%')
  AND processing_status NOT IN ('processed', 'published');

-- Now safely remove the problematic Eastbourne content source
DELETE FROM content_sources WHERE id = 'a84f8854-1888-43ca-88c1-831f2fd53c49' AND feed_url LIKE '%eastbourne%';