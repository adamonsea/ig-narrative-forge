-- Fix trigger issue by dropping and recreating
DROP TRIGGER IF EXISTS update_topic_event_preferences_updated_at ON topic_event_preferences;

CREATE TRIGGER update_topic_event_preferences_updated_at
    BEFORE UPDATE ON topic_event_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_events_updated_at_column();