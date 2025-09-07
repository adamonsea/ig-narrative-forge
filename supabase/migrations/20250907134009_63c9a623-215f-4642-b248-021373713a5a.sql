-- Update all articles referencing the problematic source to remove the reference
UPDATE articles 
SET source_id = NULL,
    processing_status = CASE 
      WHEN processing_status NOT IN ('processed', 'published') THEN 'discarded'
      ELSE processing_status
    END,
    import_metadata = COALESCE(import_metadata, '{}')::jsonb || 
      jsonb_build_object(
        'source_removed_reason', 'Eastbourne source removed from Hastings topic',
        'cleanup_at', now(),
        'original_source_id', 'a84f8854-1888-43ca-88c1-831f2fd53c49'
      )
WHERE source_id = 'a84f8854-1888-43ca-88c1-831f2fd53c49';

-- Now delete the problematic content source
DELETE FROM content_sources WHERE id = 'a84f8854-1888-43ca-88c1-831f2fd53c49';