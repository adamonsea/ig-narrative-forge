-- Add sentiment_direction column to sentiment_keyword_tracking
ALTER TABLE sentiment_keyword_tracking 
ADD COLUMN sentiment_direction text CHECK (sentiment_direction IN ('positive', 'negative'));

-- Add sentiment_direction column to sentiment_cards
ALTER TABLE sentiment_cards
ADD COLUMN sentiment_direction text CHECK (sentiment_direction IN ('positive', 'negative'));

-- Drop old unique constraint on sentiment_keyword_tracking
ALTER TABLE sentiment_keyword_tracking 
DROP CONSTRAINT IF EXISTS sentiment_keyword_tracking_topic_id_keyword_phrase_key;

-- Add new unique constraint including sentiment_direction
ALTER TABLE sentiment_keyword_tracking 
ADD CONSTRAINT sentiment_keyword_tracking_topic_sentiment_unique 
UNIQUE (topic_id, keyword_phrase, sentiment_direction);

-- Update sentiment_keyword_history for weekly snapshots
ALTER TABLE sentiment_keyword_history
ADD COLUMN sentiment_direction text CHECK (sentiment_direction IN ('positive', 'negative'));

-- Drop old unique constraint on sentiment_keyword_history
ALTER TABLE sentiment_keyword_history
DROP CONSTRAINT IF EXISTS sentiment_keyword_history_topic_id_keyword_phrase_week_st_key;

-- Add new unique constraint including sentiment_direction
ALTER TABLE sentiment_keyword_history
ADD CONSTRAINT sentiment_keyword_history_topic_sentiment_week_unique
UNIQUE (topic_id, keyword_phrase, sentiment_direction, week_start_date);

-- Update the snapshot function to handle split sentiment
CREATE OR REPLACE FUNCTION snapshot_sentiment_keywords()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_week_start DATE;
BEGIN
  current_week_start := date_trunc('week', CURRENT_DATE)::DATE;
  
  INSERT INTO sentiment_keyword_history (
    topic_id,
    keyword_phrase,
    sentiment_direction,
    week_start_date,
    total_mentions,
    positive_mentions,
    negative_mentions,
    neutral_mentions,
    sentiment_ratio,
    source_count
  )
  SELECT 
    topic_id,
    keyword_phrase,
    sentiment_direction,
    current_week_start,
    total_mentions,
    positive_mentions,
    negative_mentions,
    neutral_mentions,
    sentiment_ratio,
    source_count
  FROM sentiment_keyword_tracking
  WHERE tracked_for_cards = true
  ON CONFLICT (topic_id, keyword_phrase, sentiment_direction, week_start_date)
  DO UPDATE SET
    total_mentions = EXCLUDED.total_mentions,
    positive_mentions = EXCLUDED.positive_mentions,
    negative_mentions = EXCLUDED.negative_mentions,
    neutral_mentions = EXCLUDED.neutral_mentions,
    sentiment_ratio = EXCLUDED.sentiment_ratio,
    source_count = EXCLUDED.source_count,
    created_at = NOW();
END;
$$;