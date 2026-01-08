-- Create widget_analytics table for tracking impressions and clicks
CREATE TABLE public.widget_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  story_id UUID REFERENCES public.stories(id) ON DELETE SET NULL,
  referrer_url TEXT,
  visitor_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.widget_analytics ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (widget is public)
CREATE POLICY "Anyone can insert widget analytics" 
ON public.widget_analytics 
FOR INSERT 
WITH CHECK (true);

-- Allow topic members to view their analytics
CREATE POLICY "Topic members can view widget analytics" 
ON public.widget_analytics 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.topic_memberships tm
    WHERE tm.topic_id = widget_analytics.topic_id
    AND tm.user_id = auth.uid()
  )
);

-- Indexes for efficient querying
CREATE INDEX idx_widget_analytics_topic_id ON public.widget_analytics(topic_id);
CREATE INDEX idx_widget_analytics_created_at ON public.widget_analytics(created_at DESC);
CREATE INDEX idx_widget_analytics_event_type ON public.widget_analytics(event_type);
CREATE INDEX idx_widget_analytics_topic_date ON public.widget_analytics(topic_id, created_at DESC);