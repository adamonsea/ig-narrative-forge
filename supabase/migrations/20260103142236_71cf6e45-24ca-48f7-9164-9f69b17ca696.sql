-- Create feed_clicks table for raw click tracking (non-deduplicated)
CREATE TABLE public.feed_clicks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL,
  visitor_id VARCHAR(200) NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  page_type VARCHAR(50) DEFAULT 'feed',
  click_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for analytics queries
CREATE INDEX idx_feed_clicks_topic_date ON feed_clicks(topic_id, created_at DESC);
CREATE INDEX idx_feed_clicks_topic_daily ON feed_clicks(topic_id, click_date);

-- Enable RLS
ALTER TABLE public.feed_clicks ENABLE ROW LEVEL SECURITY;

-- Allow inserts from anyone (anonymous tracking)
CREATE POLICY "Allow anonymous click tracking inserts"
ON public.feed_clicks
FOR INSERT
WITH CHECK (true);

-- Allow reads for analytics (authenticated users only)
CREATE POLICY "Allow authenticated reads for analytics"
ON public.feed_clicks
FOR SELECT
USING (auth.role() = 'authenticated');