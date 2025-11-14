-- Phase 1: Refined Sentiment System Schema

-- 1.1 Update topic_sentiment_settings for independent card type controls
ALTER TABLE topic_sentiment_settings
ADD COLUMN IF NOT EXISTS comparison_cards_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS keyword_cards_enabled BOOLEAN DEFAULT false;

-- Set sentiment to OFF by default for all existing topics
UPDATE topic_sentiment_settings SET enabled = false;

-- Enable sentiment + both card types for test feeds only (Eastbourne and AI for agency)
UPDATE topic_sentiment_settings 
SET 
  enabled = true,
  comparison_cards_enabled = true,
  keyword_cards_enabled = true
WHERE topic_id IN (
  SELECT id FROM topics WHERE LOWER(name) LIKE '%eastbourne%' OR LOWER(name) LIKE '%ai for agency%'
);

-- 1.2 Update sentiment_keyword_tracking with editorial workflow statuses
ALTER TABLE sentiment_keyword_tracking
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_review',
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS discarded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS review_due_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_auto_resurface_at TIMESTAMPTZ;

-- Add check constraint for status values
ALTER TABLE sentiment_keyword_tracking
DROP CONSTRAINT IF EXISTS sentiment_keyword_tracking_status_check;

ALTER TABLE sentiment_keyword_tracking
ADD CONSTRAINT sentiment_keyword_tracking_status_check 
CHECK (status IN ('pending_review', 'published', 'discarded', 'hidden'));

-- 1.3 Update sentiment_cards for comparison vs detail card types
ALTER TABLE sentiment_cards
ADD COLUMN IF NOT EXISTS card_category TEXT DEFAULT 'detail',
ADD COLUMN IF NOT EXISTS comparison_keyword_ids UUID[],
ADD COLUMN IF NOT EXISTS data_window_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS data_window_end TIMESTAMPTZ;

-- Add check constraint for card category
ALTER TABLE sentiment_cards
DROP CONSTRAINT IF EXISTS sentiment_cards_card_category_check;

ALTER TABLE sentiment_cards
ADD CONSTRAINT sentiment_cards_card_category_check 
CHECK (card_category IN ('detail', 'comparison'));

-- 1.4 CLEANUP: Delete existing low-quality data
DELETE FROM sentiment_cards;
TRUNCATE sentiment_keyword_tracking CASCADE;

-- Add helpful comment
COMMENT ON COLUMN topic_sentiment_settings.comparison_cards_enabled IS 'Auto-generates daily comparison charts of top positive/negative keywords';
COMMENT ON COLUMN topic_sentiment_settings.keyword_cards_enabled IS 'Allows generating detailed cards for individual published keywords';
COMMENT ON COLUMN sentiment_keyword_tracking.status IS 'Editorial workflow status: pending_review, published, discarded, hidden';
COMMENT ON COLUMN sentiment_cards.card_category IS 'Card type: detail (single keyword) or comparison (weekly overview)';