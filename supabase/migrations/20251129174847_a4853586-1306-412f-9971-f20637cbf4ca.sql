
-- Create story_impressions table if not exists
CREATE TABLE IF NOT EXISTS story_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  impression_date date NOT NULL DEFAULT CURRENT_DATE
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_story_impressions_topic_date ON story_impressions(topic_id, impression_date);
CREATE INDEX IF NOT EXISTS idx_story_impressions_visitor ON story_impressions(topic_id, visitor_id, story_id);

-- Create unique constraint to prevent duplicate impressions per visitor per story per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_story_impressions_unique 
ON story_impressions(topic_id, story_id, visitor_id, impression_date);

-- Enable RLS
ALTER TABLE story_impressions ENABLE ROW LEVEL SECURITY;

-- Allow public inserts (anonymous tracking)
CREATE POLICY "Anyone can record story impressions"
ON story_impressions FOR INSERT
WITH CHECK (true);

-- Allow public reads for analytics
CREATE POLICY "Anyone can read story impressions"
ON story_impressions FOR SELECT
USING (true);

-- Service role full access
CREATE POLICY "Service role full access to impressions"
ON story_impressions FOR ALL
USING (auth.role() = 'service_role'::text);
