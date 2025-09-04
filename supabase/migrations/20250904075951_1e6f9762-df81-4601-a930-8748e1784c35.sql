-- Create sentiment cards table
CREATE TABLE sentiment_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id),
  keyword_phrase TEXT NOT NULL,
  analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
  content JSONB NOT NULL DEFAULT '{}', -- quotes, stats, summaries
  sources JSONB NOT NULL DEFAULT '[]', -- source URLs, dates, attributions
  sentiment_score INTEGER DEFAULT 0, -- -100 to +100
  confidence_score INTEGER DEFAULT 0, -- 0-100
  is_published BOOLEAN DEFAULT true, -- auto-publish
  needs_review BOOLEAN DEFAULT true, -- flag for new cards
  is_visible BOOLEAN DEFAULT true, -- topic owner toggle
  card_type TEXT DEFAULT 'trend' CHECK (card_type IN ('quote', 'trend', 'comparison', 'timeline')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create topic sentiment settings table
CREATE TABLE topic_sentiment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) UNIQUE,
  enabled BOOLEAN DEFAULT true,
  excluded_keywords TEXT[] DEFAULT '{}',
  analysis_frequency_hours INTEGER DEFAULT 24,
  last_analysis_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE sentiment_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_sentiment_settings ENABLE ROW LEVEL SECURITY;

-- Policies for sentiment_cards
CREATE POLICY "Topic owners can manage their sentiment cards" 
ON sentiment_cards 
FOR ALL 
USING (
  topic_id IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  topic_id IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Published sentiment cards are publicly viewable" 
ON sentiment_cards 
FOR SELECT 
USING (is_published = true AND is_visible = true);

-- Policies for topic_sentiment_settings
CREATE POLICY "Topic owners can manage their sentiment settings" 
ON topic_sentiment_settings 
FOR ALL 
USING (
  topic_id IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  topic_id IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Add updated_at trigger for sentiment_cards
CREATE TRIGGER update_sentiment_cards_updated_at
BEFORE UPDATE ON sentiment_cards
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Add updated_at trigger for topic_sentiment_settings
CREATE TRIGGER update_topic_sentiment_settings_updated_at
BEFORE UPDATE ON topic_sentiment_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create index for performance
CREATE INDEX idx_sentiment_cards_topic_id ON sentiment_cards(topic_id);
CREATE INDEX idx_sentiment_cards_needs_review ON sentiment_cards(needs_review) WHERE needs_review = true;
CREATE INDEX idx_topic_sentiment_settings_topic_id ON topic_sentiment_settings(topic_id);