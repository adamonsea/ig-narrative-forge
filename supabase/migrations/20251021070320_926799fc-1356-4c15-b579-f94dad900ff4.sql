-- Create keyword_analytics table for cross-topic learning
CREATE TABLE IF NOT EXISTS keyword_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword text NOT NULL,
  topic_type text NOT NULL CHECK (topic_type IN ('regional', 'keyword')),
  usage_count integer DEFAULT 1,
  success_metrics jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_keyword_type UNIQUE(keyword, topic_type)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_keyword_analytics_type ON keyword_analytics(topic_type);
CREATE INDEX IF NOT EXISTS idx_keyword_analytics_usage ON keyword_analytics(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_analytics_keyword ON keyword_analytics(keyword);

-- Enable RLS
ALTER TABLE keyword_analytics ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Keyword analytics readable by authenticated users"
  ON keyword_analytics FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role to manage
CREATE POLICY "Service role can manage keyword analytics"
  ON keyword_analytics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_keyword_analytics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_keyword_analytics_updated_at
  BEFORE UPDATE ON keyword_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_keyword_analytics_updated_at();