-- Create ab_test_events table for tracking A/B test impressions and clicks
CREATE TABLE public.ab_test_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_name TEXT NOT NULL,
  variant TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  visitor_id TEXT NOT NULL,
  topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.ab_test_events ENABLE ROW LEVEL SECURITY;

-- Create policy for inserting events (anyone can insert - public tracking)
CREATE POLICY "Anyone can insert ab test events"
ON public.ab_test_events
FOR INSERT
WITH CHECK (true);

-- Create policy for reading events (super admin only - authenticated users)
CREATE POLICY "Authenticated users can read ab test events"
ON public.ab_test_events
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create indexes for efficient querying
CREATE INDEX idx_ab_test_events_test_name ON public.ab_test_events(test_name);
CREATE INDEX idx_ab_test_events_created_at ON public.ab_test_events(created_at DESC);
CREATE INDEX idx_ab_test_events_test_variant ON public.ab_test_events(test_name, variant);
CREATE INDEX idx_ab_test_events_topic ON public.ab_test_events(topic_id) WHERE topic_id IS NOT NULL;

-- Create a function to get A/B test stats
CREATE OR REPLACE FUNCTION public.get_ab_test_stats(
  p_test_name TEXT,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  variant TEXT,
  impressions BIGINT,
  clicks BIGINT,
  ctr NUMERIC,
  unique_visitors BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.variant,
    COUNT(*) FILTER (WHERE e.event_type = 'impression') as impressions,
    COUNT(*) FILTER (WHERE e.event_type = 'click') as clicks,
    CASE 
      WHEN COUNT(*) FILTER (WHERE e.event_type = 'impression') > 0 
      THEN ROUND(
        (COUNT(*) FILTER (WHERE e.event_type = 'click')::NUMERIC / 
         COUNT(*) FILTER (WHERE e.event_type = 'impression')::NUMERIC) * 100, 2
      )
      ELSE 0
    END as ctr,
    COUNT(DISTINCT e.visitor_id) as unique_visitors
  FROM public.ab_test_events e
  WHERE e.test_name = p_test_name
    AND e.created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY e.variant
  ORDER BY e.variant;
END;
$$;