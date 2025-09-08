-- Universal Platform Fix: Auto-generate missing scrape schedules and monitoring

-- Create scrape_schedules table if it doesn't exist
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

-- Create source health monitoring table
CREATE TABLE IF NOT EXISTS public.source_health_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL,
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
  
  -- Also create schedules for standalone sources without topic association
  FOR source_record IN 
    SELECT cs.id as source_id
    FROM content_sources cs
    WHERE cs.is_active = true
      AND cs.topic_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM scrape_schedules ss 
        WHERE ss.source_id = cs.id
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
      NULL,
      12,  -- Standard frequency
      now() + INTERVAL '30 minutes',
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
DECLARE
  current_metrics RECORD;
  new_success_rate NUMERIC;
  new_health_score INTEGER;
BEGIN
  -- Get current metrics or create if doesn't exist
  SELECT * INTO current_metrics 
  FROM source_health_metrics 
  WHERE source_id = p_source_id;
  
  IF NOT FOUND THEN
    INSERT INTO source_health_metrics (
      source_id,
      health_score,
      success_rate,
      avg_response_time_ms,
      consecutive_failures,
      last_health_check
    ) VALUES (
      p_source_id,
      CASE WHEN p_success THEN 100 ELSE 50 END,
      CASE WHEN p_success THEN 100.00 ELSE 0.00 END,
      p_response_time_ms,
      CASE WHEN p_success THEN 0 ELSE 1 END,
      now()
    );
  ELSE
    -- Calculate new success rate (weighted average over last 100 attempts)
    new_success_rate := CASE 
      WHEN p_success THEN 
        LEAST(100.00, current_metrics.success_rate * 0.9 + 10.0)
      ELSE 
        GREATEST(0.00, current_metrics.success_rate * 0.9)
    END;
    
    -- Calculate health score based on success rate and response time
    new_health_score := CASE
      WHEN new_success_rate >= 90 THEN 100
      WHEN new_success_rate >= 70 THEN 80
      WHEN new_success_rate >= 50 THEN 60
      WHEN new_success_rate >= 25 THEN 40
      ELSE 20
    END;
    
    -- Reduce health score for slow responses
    IF p_response_time_ms IS NOT NULL AND p_response_time_ms > 10000 THEN
      new_health_score := new_health_score - 10;
    END IF;
    
    -- Update metrics
    UPDATE source_health_metrics SET
      health_score = new_health_score,
      success_rate = new_success_rate,
      avg_response_time_ms = COALESCE(
        (COALESCE(avg_response_time_ms, 0) * 0.8 + COALESCE(p_response_time_ms, 0) * 0.2)::INTEGER,
        avg_response_time_ms
      ),
      last_successful_scrape = CASE WHEN p_success THEN now() ELSE last_successful_scrape END,
      consecutive_failures = CASE 
        WHEN p_success THEN 0 
        ELSE consecutive_failures + 1 
      END,
      recommended_action = CASE
        WHEN new_health_score >= 80 THEN 'none'
        WHEN new_health_score >= 60 THEN 'monitor'
        WHEN new_health_score >= 40 THEN 'method_change'
        ELSE 'investigate'
      END,
      last_health_check = now(),
      updated_at = now()
    WHERE source_id = p_source_id;
  END IF;
END;
$$;

-- Function to recover unhealthy sources
CREATE OR REPLACE FUNCTION public.recover_unhealthy_sources()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  recovery_count INTEGER := 0;
  deactivation_count INTEGER := 0;
  source_record RECORD;
BEGIN
  -- Deactivate sources that have been failing for too long
  FOR source_record IN 
    SELECT cs.id, cs.source_name, shm.consecutive_failures, shm.health_score
    FROM source_health_metrics shm
    JOIN content_sources cs ON cs.id = shm.source_id
    WHERE shm.consecutive_failures >= 10
      AND shm.health_score <= 20
      AND cs.is_active = true
  LOOP
    -- Deactivate the source temporarily
    UPDATE content_sources 
    SET is_active = false,
        updated_at = now()
    WHERE id = source_record.id;
    
    -- Deactivate associated schedules
    UPDATE scrape_schedules 
    SET is_active = false,
        updated_at = now()
    WHERE source_id = source_record.id;
    
    deactivation_count := deactivation_count + 1;
    
    -- Log the deactivation
    INSERT INTO system_logs (level, message, context, function_name)
    VALUES (
      'warn',
      'Auto-deactivated unhealthy source',
      jsonb_build_object(
        'source_id', source_record.id,
        'source_name', source_record.source_name,
        'consecutive_failures', source_record.consecutive_failures,
        'health_score', source_record.health_score
      ),
      'recover_unhealthy_sources'
    );
  END LOOP;
  
  -- Reset consecutive failures for sources that have recovered
  UPDATE source_health_metrics 
  SET consecutive_failures = 0,
      updated_at = now()
  WHERE consecutive_failures > 0
    AND health_score >= 70
    AND last_successful_scrape > now() - INTERVAL '24 hours';
    
  GET DIAGNOSTICS recovery_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'sources_recovered', recovery_count,
    'sources_deactivated', deactivation_count
  );
END;
$$;

-- Enable RLS and create policies
ALTER TABLE public.scrape_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_health_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scrape_schedules
CREATE POLICY "Scrape schedules admin access" ON public.scrape_schedules
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Scrape schedules service role access" ON public.scrape_schedules
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Topic owners can view their schedules" ON public.scrape_schedules
  FOR SELECT USING (
    topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    ) OR has_role(auth.uid(), 'admin'::app_role)
  );

-- RLS Policies for source_health_metrics
CREATE POLICY "Health metrics admin access" ON public.source_health_metrics
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Health metrics service role access" ON public.source_health_metrics
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Topic owners can view health metrics" ON public.source_health_metrics
  FOR SELECT USING (
    source_id IN (
      SELECT ts.source_id FROM topic_sources ts
      JOIN topics t ON t.id = ts.topic_id
      WHERE t.created_by = auth.uid()
    ) OR has_role(auth.uid(), 'admin'::app_role)
  );