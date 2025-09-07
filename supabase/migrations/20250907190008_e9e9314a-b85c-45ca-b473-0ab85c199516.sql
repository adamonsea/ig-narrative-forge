-- Remove global unique constraint on source_name to allow same source on multiple topics
ALTER TABLE content_sources DROP CONSTRAINT IF EXISTS content_sources_source_name_key;

-- Add composite unique constraint to prevent true duplicates within the same topic
ALTER TABLE content_sources ADD CONSTRAINT content_sources_source_name_topic_id_key 
UNIQUE (source_name, topic_id);