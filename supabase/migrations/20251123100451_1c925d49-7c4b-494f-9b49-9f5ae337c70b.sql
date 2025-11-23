-- Create automated insight cards table
CREATE TABLE IF NOT EXISTS public.automated_insight_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  card_type TEXT NOT NULL, -- 'story_momentum', 'this_time_last_month', 'social_proof', 'reading_streak'
  
  -- Card content
  headline TEXT NOT NULL,
  insight_data JSONB DEFAULT '{}'::jsonb,
  slides JSONB DEFAULT '[]'::jsonb, -- Array of slide objects (same format as sentiment_cards)
  
  -- Display management
  relevance_score INTEGER DEFAULT 50 CHECK (relevance_score >= 0 AND relevance_score <= 100),
  display_frequency INTEGER DEFAULT 6 CHECK (display_frequency > 0),
  display_count INTEGER DEFAULT 0,
  last_shown_at TIMESTAMPTZ,
  
  -- Lifecycle
  valid_until TIMESTAMPTZ NOT NULL,
  is_published BOOLEAN DEFAULT true,
  is_visible BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_insight_cards_topic_published 
  ON public.automated_insight_cards(topic_id, is_published, is_visible, valid_until);

CREATE INDEX IF NOT EXISTS idx_insight_cards_valid_until 
  ON public.automated_insight_cards(valid_until);

CREATE INDEX IF NOT EXISTS idx_insight_cards_display 
  ON public.automated_insight_cards(topic_id, last_shown_at);

-- Add automated insights toggle to topics
ALTER TABLE public.topics 
ADD COLUMN IF NOT EXISTS automated_insights_enabled BOOLEAN DEFAULT true;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_insight_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_insight_cards_updated_at ON public.automated_insight_cards;
CREATE TRIGGER trigger_update_insight_cards_updated_at
  BEFORE UPDATE ON public.automated_insight_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_insight_cards_updated_at();

-- RLS Policies
ALTER TABLE public.automated_insight_cards ENABLE ROW LEVEL SECURITY;

-- Public can read published cards for active topics
CREATE POLICY "Public can view published insight cards"
  ON public.automated_insight_cards
  FOR SELECT
  USING (
    is_published = true 
    AND is_visible = true 
    AND EXISTS (
      SELECT 1 FROM public.topics 
      WHERE topics.id = automated_insight_cards.topic_id 
      AND topics.is_active = true
    )
  );

-- Authenticated users can manage their own topic's cards
CREATE POLICY "Users can manage their topic insight cards"
  ON public.automated_insight_cards
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.topics 
      WHERE topics.id = automated_insight_cards.topic_id 
      AND topics.created_by = auth.uid()
    )
  );

-- Service role has full access (for edge functions)
CREATE POLICY "Service role has full access"
  ON public.automated_insight_cards
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);