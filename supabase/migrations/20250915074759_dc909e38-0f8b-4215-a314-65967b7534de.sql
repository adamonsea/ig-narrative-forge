-- Add validation columns to events table
ALTER TABLE events 
ADD COLUMN validation_status TEXT CHECK (validation_status IN ('valid', 'broken', 'timeout')),
ADD COLUMN last_validated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN validation_error TEXT;

-- Create topic event preferences table
CREATE TABLE IF NOT EXISTS topic_event_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(topic_id, event_type)
);

-- Enable RLS
ALTER TABLE topic_event_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for topic event preferences
CREATE POLICY "Topic owners can manage their event preferences" 
ON topic_event_preferences 
FOR ALL 
USING (
  topic_id IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  topic_id IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Add index for better performance
CREATE INDEX idx_topic_event_preferences_topic_id ON topic_event_preferences(topic_id);
CREATE INDEX idx_events_validation_status ON events(validation_status);

-- Update trigger for topic_event_preferences
CREATE TRIGGER update_topic_event_preferences_updated_at
    BEFORE UPDATE ON topic_event_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_events_updated_at_column();