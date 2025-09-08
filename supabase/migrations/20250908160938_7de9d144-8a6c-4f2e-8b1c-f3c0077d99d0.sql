-- Fix the function to work with actual scrape_schedules schema
CREATE OR REPLACE FUNCTION public.auto_generate_missing_schedules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  missing_count INTEGER := 0;
  source_record RECORD;
BEGIN
  -- Generate schedules for content sources that don't have them
  FOR source_record IN 
    SELECT 
      cs.id as source_id,
      cs.topic_id,
      t.topic_type,
      cs.source_name
    FROM content_sources cs
    JOIN topics t ON t.id = cs.topic_id
    WHERE cs.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM scrape_schedules ss 
        WHERE ss.source_id = cs.id
      )
  LOOP
    INSERT INTO scrape_schedules (
      source_id,
      schedule_type,
      frequency_hours,
      next_run_at,
      is_active,
      run_count,
      success_rate
    ) VALUES (
      source_record.source_id,
      source_record.topic_type || '_scrape',  -- e.g. 'regional_scrape', 'keyword_scrape'
      CASE 
        WHEN source_record.topic_type = 'regional' THEN 8  -- More frequent for regional
        ELSE 12  -- Standard frequency for keyword topics
      END,
      now() + INTERVAL '15 minutes',  -- Start soon
      true,
      0,   -- Initial run count
      0.0  -- Initial success rate
    );
    
    missing_count := missing_count + 1;
  END LOOP;
  
  -- Log the generation
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Universal platform fix: Auto-generated missing scrape schedules',
    jsonb_build_object(
      'schedules_created', missing_count,
      'fix_type', 'universal_platform_fix'
    ),
    'auto_generate_missing_schedules'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'schedules_created', missing_count,
    'message', format('Generated %s missing scrape schedules', missing_count)
  );
END;
$$;

-- Execute the schedule generation
SELECT auto_generate_missing_schedules();

-- Fix articles that were incorrectly discarded due to overly strict validation
WITH restored_articles AS (
  UPDATE articles 
  SET processing_status = 'new',
      import_metadata = COALESCE(import_metadata, '{}'::jsonb) || jsonb_build_object(
        'restored_by_platform_fix', true,
        'restored_at', now(),
        'original_status', 'discarded'
      )
  WHERE processing_status = 'discarded' 
    AND (
      import_metadata->>'rejection_reason' = 'INVALID_CONTENT' OR
      import_metadata->>'rejection_reason' LIKE '%invalid%' OR
      import_metadata->>'rejection_reason' LIKE '%content%'
    )
    AND LENGTH(COALESCE(title, '')) > 10
    AND LENGTH(COALESCE(body, '')) > 100
  RETURNING id, title
)
INSERT INTO system_logs (level, message, context, function_name)
SELECT 
  'info',
  'Universal platform fix: Restored incorrectly discarded articles',
  jsonb_build_object(
    'articles_restored', COUNT(*),
    'fix_type', 'content_validation_fix'
  ),
  'universal_platform_fix'
FROM restored_articles;