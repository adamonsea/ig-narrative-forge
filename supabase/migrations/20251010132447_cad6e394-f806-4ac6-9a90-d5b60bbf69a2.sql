-- Add community pulse card frequency setting to topics
ALTER TABLE topics
ADD COLUMN community_pulse_frequency integer DEFAULT 8;

COMMENT ON COLUMN topics.community_pulse_frequency IS 'How often to show Community Pulse cards in feed (every N stories)';