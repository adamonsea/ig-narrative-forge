-- Pipeline cleanup for Hastings and Eastbourne topics
-- Clean up articles that match negative keywords, competing regions, or have very low relevance

UPDATE articles 
SET processing_status = 'discarded',
    import_metadata = COALESCE(import_metadata, '{}'::jsonb) || jsonb_build_object(
      'discard_reason', 'Contains negative keyword or competing region',
      'discarded_by', 'pipeline_cleanup',
      'discarded_at', NOW()::text
    )
WHERE id IN (
  SELECT a.id
  FROM articles a
  JOIN topics t ON a.topic_id = t.id
  WHERE (LOWER(t.name) LIKE '%hastings%' OR LOWER(t.name) LIKE '%eastbourne%')
    AND a.processing_status IN ('new', 'processed')
    AND (
      -- Articles that contain negative keywords
      (t.negative_keywords IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(t.negative_keywords) AS nk 
        WHERE LOWER(a.title || ' ' || COALESCE(a.body, '')) LIKE '%' || LOWER(nk) || '%'
      ))
      OR
      -- Articles that mention competing regions
      (t.competing_regions IS NOT NULL AND EXISTS (
        SELECT 1 FROM unnest(t.competing_regions) AS cr 
        WHERE LOWER(a.title || ' ' || COALESCE(a.body, '')) LIKE '%' || LOWER(cr) || '%'
      ))
      OR
      -- Articles with very low regional relevance (below 5)
      (a.regional_relevance_score < 5)
    )
);