-- Create feed_visits table for tracking unique visits
CREATE TABLE public.feed_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL,
  visitor_id TEXT NOT NULL, -- IP hash or session identifier
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for efficient queries
CREATE INDEX idx_feed_visits_topic_date ON public.feed_visits(topic_id, visit_date);
CREATE INDEX idx_feed_visits_visitor_date ON public.feed_visits(visitor_id, visit_date);

-- Create unique constraint to ensure one visit per visitor per day per topic
CREATE UNIQUE INDEX idx_feed_visits_unique_daily ON public.feed_visits(topic_id, visitor_id, visit_date);

-- RLS policies
ALTER TABLE public.feed_visits ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage all visits
CREATE POLICY "Service role can manage feed visits" ON public.feed_visits
  FOR ALL USING (auth.role() = 'service_role');

-- Topic owners can view their visit stats
CREATE POLICY "Topic owners can view their visit stats" ON public.feed_visits
  FOR SELECT USING (
    topic_id IN (
      SELECT id FROM topics WHERE created_by = auth.uid()
    ) OR has_role(auth.uid(), 'admin')
  );

-- Public can insert visits (for tracking)
CREATE POLICY "Public can record visits" ON public.feed_visits
  FOR INSERT WITH CHECK (true);

-- Function to get visitor stats for a topic
CREATE OR REPLACE FUNCTION public.get_topic_visitor_stats(p_topic_id UUID)
RETURNS TABLE(
  visits_today INTEGER,
  visits_this_week INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(DISTINCT visitor_id)::INTEGER 
     FROM feed_visits 
     WHERE topic_id = p_topic_id 
       AND visit_date = CURRENT_DATE) as visits_today,
    (SELECT COUNT(DISTINCT visitor_id)::INTEGER 
     FROM feed_visits 
     WHERE topic_id = p_topic_id 
       AND visit_date >= CURRENT_DATE - INTERVAL '6 days') as visits_this_week;
END;
$$;

-- Function to record a feed visit
CREATE OR REPLACE FUNCTION public.record_feed_visit(
  p_topic_id UUID,
  p_visitor_id TEXT,
  p_user_agent TEXT DEFAULT NULL,
  p_referrer TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Insert visit, on conflict do nothing (already visited today)
  INSERT INTO feed_visits (topic_id, visitor_id, user_agent, referrer)
  VALUES (p_topic_id, p_visitor_id, p_user_agent, p_referrer)
  ON CONFLICT (topic_id, visitor_id, visit_date) DO NOTHING;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;