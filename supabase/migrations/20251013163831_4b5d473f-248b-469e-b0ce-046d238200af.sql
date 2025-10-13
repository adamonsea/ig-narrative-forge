-- Create sentiment keyword tracking table for auto-trending keywords
CREATE TABLE sentiment_keyword_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE NOT NULL,
  keyword_phrase TEXT NOT NULL,
  
  -- Auto-discovery metrics
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  total_mentions INTEGER DEFAULT 0,
  source_count INTEGER DEFAULT 0,
  current_trend TEXT DEFAULT 'emerging' CHECK (current_trend IN ('emerging', 'sustained', 'fading')),
  
  -- User actions
  tracked_for_cards BOOLEAN DEFAULT false,
  
  -- Generation tracking
  last_card_generated_at TIMESTAMPTZ,
  next_card_due_at TIMESTAMPTZ,
  total_cards_generated INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(topic_id, keyword_phrase)
);

-- Enable RLS
ALTER TABLE sentiment_keyword_tracking ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Topic owners can manage keyword tracking"
  ON sentiment_keyword_tracking
  FOR ALL
  USING (
    topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    ) OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Create index for efficient lookups
CREATE INDEX idx_sentiment_tracking_active 
  ON sentiment_keyword_tracking(topic_id, tracked_for_cards, next_card_due_at)
  WHERE tracked_for_cards = true;

-- Create index for trend queries
CREATE INDEX idx_sentiment_tracking_trend
  ON sentiment_keyword_tracking(topic_id, current_trend, last_seen_at);