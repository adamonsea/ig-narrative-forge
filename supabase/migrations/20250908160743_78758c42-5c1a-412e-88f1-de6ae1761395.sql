-- Create the core functions for universal platform fix

-- Function to auto-generate missing scrape schedules
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
  -- Create schedules table if it doesn't exist
  CREATE TABLE IF NOT EXISTS public.scrape_schedules (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    source_id UUID NOT NULL,
    topic_id UUID,
    frequency_hours INTEGER NOT NULL DEFAULT 12,
    next_run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '1 hour'),
    last_run_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  );

  -- Generate schedules for topic sources that don't have them
  FOR source_record IN 
    SELECT DISTINCT 
      ts.source_id,
      ts.topic_id,
      t.topic_type
    FROM topic_sources ts
    JOIN topics t ON t.id = ts.topic_id
    WHERE ts.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM scrape_schedules ss 
        WHERE ss.source_id = ts.source_id 
        AND (ss.topic_id = ts.topic_id OR ss.topic_id IS NULL)
      )
  LOOP
    INSERT INTO scrape_schedules (
      source_id,
      topic_id,
      frequency_hours,
      next_run_at,
      is_active
    ) VALUES (
      source_record.source_id,
      source_record.topic_id,
      CASE 
        WHEN source_record.topic_type = 'regional' THEN 8  -- More frequent for regional
        ELSE 12  -- Standard frequency for keyword topics
      END,
      now() + INTERVAL '15 minutes',  -- Start soon
      true
    );
    
    missing_count := missing_count + 1;
  END LOOP;
  
  -- Log the generation
  INSERT INTO system_logs (level, message, context, function_name)
  VALUES (
    'info',
    'Auto-generated missing scrape schedules',
    jsonb_build_object(
      'schedules_created', missing_count,
      'fix_type', 'universal_platform_fix'
    ),
    'auto_generate_missing_schedules'
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'schedules_created', missing_count,
    'message', 'Missing scrape schedules generated successfully'
  );
END;
$$;

-- Function to update source health metrics  
CREATE OR REPLACE FUNCTION public.update_source_health_metrics(
  p_source_id UUID,
  p_success BOOLEAN,
  p_response_time_ms INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Create health metrics table if it doesn't exist
  CREATE TABLE IF NOT EXISTS public.source_health_metrics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    source_id UUID NOT NULL UNIQUE,
    health_score INTEGER NOT NULL DEFAULT 100,
    success_rate NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    avg_response_time_ms INTEGER,
    last_successful_scrape TIMESTAMP WITH TIME ZONE,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_health_check TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    recommended_action TEXT DEFAULT 'none',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  );

  -- Insert or update health metrics
  INSERT INTO source_health_metrics (
    source_id,
    health_score,
    success_rate,
    avg_response_time_ms,
    consecutive_failures,
    last_successful_scrape,
    last_health_check
  ) VALUES (
    p_source_id,
    CASE WHEN p_success THEN 100 ELSE 50 END,
    CASE WHEN p_success THEN 100.00 ELSE 0.00 END,
    p_response_time_ms,
    CASE WHEN p_success THEN 0 ELSE 1 END,
    CASE WHEN p_success THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (source_id) DO UPDATE SET
    success_rate = CASE 
      WHEN p_success THEN 
        LEAST(100.00, source_health_metrics.success_rate * 0.9 + 10.0)
      ELSE 
        GREATEST(0.00, source_health_metrics.success_rate * 0.9)
    END,
    health_score = CASE
      WHEN p_success THEN LEAST(100, source_health_metrics.health_score + 5)
      ELSE GREATEST(20, source_health_metrics.health_score - 10)
    END,
    consecutive_failures = CASE 
      WHEN p_success THEN 0 
      ELSE source_health_metrics.consecutive_failures + 1 
    END,
    last_successful_scrape = CASE 
      WHEN p_success THEN now() 
      ELSE source_health_metrics.last_successful_scrape 
    END,
    last_health_check = now(),
    updated_at = now();
END;
$$;