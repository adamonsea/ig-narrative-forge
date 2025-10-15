-- Create table to track user engagement metrics
CREATE TABLE IF NOT EXISTS public.topic_engagement_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('notification_enabled', 'pwa_installed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  UNIQUE(topic_id, visitor_id, metric_type)
);

-- Enable RLS
ALTER TABLE public.topic_engagement_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Topic owners can view their engagement metrics
CREATE POLICY "Topic owners can view engagement metrics"
ON public.topic_engagement_metrics
FOR SELECT
USING (
  topic_id IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Policy: Service role can insert metrics
CREATE POLICY "Service role can insert engagement metrics"
ON public.topic_engagement_metrics
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Create index for faster queries
CREATE INDEX idx_topic_engagement_metrics_topic_id ON public.topic_engagement_metrics(topic_id);
CREATE INDEX idx_topic_engagement_metrics_type ON public.topic_engagement_metrics(metric_type);

-- Function to get engagement stats for a topic
CREATE OR REPLACE FUNCTION public.get_topic_engagement_stats(p_topic_id UUID)
RETURNS TABLE(
  notifications_enabled BIGINT,
  pwa_installs BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE metric_type = 'notification_enabled') as notifications_enabled,
    COUNT(*) FILTER (WHERE metric_type = 'pwa_installed') as pwa_installs
  FROM topic_engagement_metrics
  WHERE topic_id = p_topic_id;
END;
$$;