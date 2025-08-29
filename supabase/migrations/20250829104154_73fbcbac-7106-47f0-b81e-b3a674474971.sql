-- Clear the 5 stuck jobs that have exhausted retries but are still marked as pending
DELETE FROM content_generation_queue 
WHERE attempts >= max_attempts AND status = 'pending';

-- Create a simpler topic automation settings table for global frequency per topic
CREATE TABLE IF NOT EXISTS topic_automation_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  scrape_frequency_hours INTEGER NOT NULL DEFAULT 12,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE NULL,
  next_run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + '12:00:00'::interval),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(topic_id)
);

-- Enable RLS
ALTER TABLE topic_automation_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for topic automation settings
CREATE POLICY "Users can manage automation for their topics"
ON topic_automation_settings
FOR ALL
USING (
  auth.uid() IS NOT NULL AND (
    topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    ) OR
    has_role(auth.uid(), 'admin'::app_role)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    ) OR
    has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Log the cleanup
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Cleaned up stuck processing jobs and created simplified automation settings',
  jsonb_build_object(
    'stuck_jobs_cleared', (SELECT count(*) FROM content_generation_queue WHERE attempts >= max_attempts AND status = 'pending'),
    'automation_table_created', 'topic_automation_settings'
  ),
  'pipeline_simplification'
);