-- Clean up duplicate articles in Eastbourne pipeline
UPDATE articles 
SET processing_status = 'discarded',
    import_metadata = COALESCE(import_metadata, '{}')::jsonb || 
      jsonb_build_object(
        'discarded_reason', 'Bulk cleanup - duplicate or low quality content',
        'cleanup_at', now(),
        'cleanup_function', 'eastbourne_duplicates_cleanup'
      )
WHERE topic_id IN (SELECT id FROM topics WHERE name ILIKE '%eastbourne%')
  AND processing_status IN ('new')
  AND created_at < (now() - INTERVAL '3 days') -- Keep only recent articles
  AND (
    regional_relevance_score < 20 OR -- Low relevance
    regional_relevance_score IS NULL OR -- No relevance calculated
    word_count < 100 OR -- Very short articles
    title ILIKE '%[%]%' OR -- Likely RSS artifacts
    title ILIKE '%-%-%' -- Likely duplicate indicators
  );