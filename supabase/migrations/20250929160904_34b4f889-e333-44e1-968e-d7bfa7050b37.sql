-- Add parliamentary tracking to topics table (safe additive change)
ALTER TABLE topics 
ADD COLUMN parliamentary_tracking_enabled BOOLEAN DEFAULT false;

-- Create parliamentary mentions table for storing MP votes and debate mentions
CREATE TABLE parliamentary_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL, -- soft reference to topics.id
  mention_type TEXT NOT NULL CHECK (mention_type IN ('vote', 'debate_mention')),
  
  -- Parliamentary data
  mp_name TEXT,
  constituency TEXT,
  party TEXT,
  vote_title TEXT,
  vote_date DATE,
  vote_direction TEXT, -- 'aye', 'no', 'abstain'
  vote_url TEXT,
  
  -- Debate mention data
  debate_title TEXT,
  debate_date DATE,
  debate_excerpt TEXT,
  hansard_url TEXT,
  
  -- Regional relevance
  region_mentioned TEXT,
  landmark_mentioned TEXT,
  relevance_score INTEGER DEFAULT 0,
  
  -- Metadata
  source_api TEXT DEFAULT 'uk_parliament',
  import_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE parliamentary_mentions ENABLE ROW LEVEL SECURITY;

-- Parliamentary mentions can be viewed by topic owners
CREATE POLICY "Parliamentary mentions viewable by topic owners"
ON parliamentary_mentions FOR SELECT
USING (
  topic_id IN (
    SELECT id FROM topics 
    WHERE created_by = auth.uid()
  ) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Parliamentary mentions can be managed by service role and topic owners
CREATE POLICY "Parliamentary mentions manageable by authorized users"
ON parliamentary_mentions FOR ALL
USING (
  auth.role() = 'service_role' OR
  topic_id IN (
    SELECT id FROM topics 
    WHERE created_by = auth.uid()
  ) OR 
  has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  auth.role() = 'service_role' OR
  topic_id IN (
    SELECT id FROM topics 
    WHERE created_by = auth.uid()
  ) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Create index for efficient queries
CREATE INDEX idx_parliamentary_mentions_topic_id ON parliamentary_mentions(topic_id);
CREATE INDEX idx_parliamentary_mentions_date ON parliamentary_mentions(vote_date, debate_date);
CREATE INDEX idx_parliamentary_mentions_type ON parliamentary_mentions(mention_type);

-- Add trigger for updated_at
CREATE TRIGGER update_parliamentary_mentions_updated_at
  BEFORE UPDATE ON parliamentary_mentions
  FOR EACH ROW
  EXECUTE FUNCTION update_events_updated_at_column();