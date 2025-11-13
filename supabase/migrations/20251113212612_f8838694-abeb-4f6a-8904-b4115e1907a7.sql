-- Create sentiment keyword history table for tracking trends over time
CREATE TABLE IF NOT EXISTS public.sentiment_keyword_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  keyword_phrase TEXT NOT NULL,
  week_start_date DATE NOT NULL,
  total_mentions INTEGER NOT NULL DEFAULT 0,
  positive_mentions INTEGER NOT NULL DEFAULT 0,
  negative_mentions INTEGER NOT NULL DEFAULT 0,
  neutral_mentions INTEGER NOT NULL DEFAULT 0,
  sentiment_ratio NUMERIC(5,4),
  source_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(topic_id, keyword_phrase, week_start_date)
);

-- Add index for efficient querying
CREATE INDEX idx_sentiment_history_topic_keyword ON public.sentiment_keyword_history(topic_id, keyword_phrase);
CREATE INDEX idx_sentiment_history_week ON public.sentiment_keyword_history(week_start_date DESC);

-- RLS policies for sentiment keyword history
ALTER TABLE public.sentiment_keyword_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Topic owners can view sentiment history"
  ON public.sentiment_keyword_history
  FOR SELECT
  USING (
    topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Service role can manage sentiment history"
  ON public.sentiment_keyword_history
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Function to snapshot current keyword data into history
CREATE OR REPLACE FUNCTION snapshot_sentiment_keywords()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_week_start DATE;
BEGIN
  -- Calculate start of current week (Monday)
  current_week_start := date_trunc('week', CURRENT_DATE)::DATE;
  
  -- Insert or update snapshot for current week
  INSERT INTO sentiment_keyword_history (
    topic_id,
    keyword_phrase,
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
    current_week_start,
    total_mentions,
    positive_mentions,
    negative_mentions,
    neutral_mentions,
    sentiment_ratio,
    source_count
  FROM sentiment_keyword_tracking
  WHERE tracked_for_cards = true
  ON CONFLICT (topic_id, keyword_phrase, week_start_date)
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

COMMENT ON TABLE public.sentiment_keyword_history IS 'Stores weekly snapshots of sentiment keyword data for trend analysis';
COMMENT ON FUNCTION snapshot_sentiment_keywords() IS 'Creates weekly snapshot of current sentiment keyword tracking data';