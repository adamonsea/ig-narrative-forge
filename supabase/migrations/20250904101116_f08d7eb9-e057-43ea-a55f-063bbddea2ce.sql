-- Add unique constraint to prevent duplicate sentiment cards on the same day
ALTER TABLE sentiment_cards 
ADD CONSTRAINT unique_topic_keyword_date 
UNIQUE (topic_id, keyword_phrase, analysis_date);

-- Add index for better performance on duplicate checks
CREATE INDEX idx_sentiment_cards_recent_lookup 
ON sentiment_cards (topic_id, keyword_phrase, created_at DESC) 
WHERE is_published = true AND is_visible = true;

-- Add content fingerprint column to track analyzed content
ALTER TABLE sentiment_cards 
ADD COLUMN content_fingerprint TEXT,
ADD COLUMN previous_sentiment_score INTEGER DEFAULT 0,
ADD COLUMN card_version INTEGER DEFAULT 1,
ADD COLUMN update_reason TEXT;