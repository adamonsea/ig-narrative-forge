-- Add sentiment breakdown columns to sentiment_keyword_tracking
ALTER TABLE sentiment_keyword_tracking 
ADD COLUMN IF NOT EXISTS positive_mentions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS negative_mentions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS neutral_mentions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sentiment_ratio DECIMAL DEFAULT 0,
ADD COLUMN IF NOT EXISTS source_urls TEXT[] DEFAULT '{}';

-- Update existing records with default values
UPDATE sentiment_keyword_tracking 
SET 
  positive_mentions = 0,
  negative_mentions = 0,
  neutral_mentions = 0,
  sentiment_ratio = 0,
  source_urls = '{}'
WHERE positive_mentions IS NULL;