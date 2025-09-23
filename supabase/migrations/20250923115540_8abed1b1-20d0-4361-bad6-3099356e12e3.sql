-- Add failure tracking columns to content_sources table
ALTER TABLE content_sources 
ADD COLUMN consecutive_failures integer DEFAULT 0,
ADD COLUMN total_failures integer DEFAULT 0,
ADD COLUMN last_failure_at timestamp with time zone,
ADD COLUMN last_failure_reason text,
ADD COLUMN recommend_replacement boolean DEFAULT false;

-- Create index for efficient failure queries
CREATE INDEX idx_content_sources_failures ON content_sources(consecutive_failures, total_failures);

-- Remove the user-level global automation table as we're moving to topic-level
DROP TABLE IF EXISTS global_automation_settings;

-- Update topic_automation_settings to be the primary automation control
ALTER TABLE topic_automation_settings 
ADD COLUMN auto_simplify_enabled boolean DEFAULT true,
ADD COLUMN quality_threshold integer DEFAULT 60;

-- Add trigger to automatically flag sources for replacement after 5 consecutive failures
CREATE OR REPLACE FUNCTION handle_source_failures()
RETURNS TRIGGER AS $$
BEGIN
  -- If consecutive failures reach 5, recommend replacement
  IF NEW.consecutive_failures >= 5 AND OLD.consecutive_failures < 5 THEN
    NEW.recommend_replacement = true;
    
    -- Log the recommendation
    INSERT INTO system_logs (level, message, context, function_name)
    VALUES (
      'warning',
      'Source recommended for replacement due to consecutive failures',
      jsonb_build_object(
        'source_id', NEW.id,
        'source_name', NEW.source_name,
        'consecutive_failures', NEW.consecutive_failures,
        'total_failures', NEW.total_failures
      ),
      'handle_source_failures'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER source_failure_handler
  BEFORE UPDATE ON content_sources
  FOR EACH ROW
  EXECUTE FUNCTION handle_source_failures();