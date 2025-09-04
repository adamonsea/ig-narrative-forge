-- Add columns to support multi-slide sentiment cards and duplication prevention
ALTER TABLE sentiment_cards 
ADD COLUMN slides JSONB DEFAULT '[]'::jsonb,
ADD COLUMN display_count INTEGER DEFAULT 0,
ADD COLUMN last_shown_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add index for efficient display tracking queries
CREATE INDEX idx_sentiment_cards_display_tracking 
ON sentiment_cards (topic_id, last_shown_at, display_count);

-- Add comment to explain the slides structure
COMMENT ON COLUMN sentiment_cards.slides IS 'Array of slide objects with structure: [{type: "hero|statistic|quote|references", content: "...", order: 1, metadata: {...}}]';
COMMENT ON COLUMN sentiment_cards.display_count IS 'Number of times this card has been shown to prevent excessive repetition';
COMMENT ON COLUMN sentiment_cards.last_shown_at IS 'Last time this card was displayed to users for duplication prevention';