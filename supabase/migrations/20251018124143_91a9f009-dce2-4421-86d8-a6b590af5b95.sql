-- Drop the old version of cleanup function if it exists
DROP FUNCTION IF EXISTS public.cleanup_expired_community_insights();

-- Create community_insights table for storing Reddit (and future) community insights
CREATE TABLE IF NOT EXISTS public.community_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('reddit')),
  source_identifier TEXT NOT NULL,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('sentiment','concern','validation')),
  content TEXT NOT NULL,
  confidence_score INTEGER CHECK (confidence_score BETWEEN 0 AND 100),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_community_insights_topic_created_at
  ON public.community_insights (topic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_insights_source
  ON public.community_insights (source_type, source_identifier);

-- Enable RLS
ALTER TABLE public.community_insights ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Insights readable by topic viewers" ON public.community_insights;
DROP POLICY IF EXISTS "Admins can insert insights" ON public.community_insights;
DROP POLICY IF EXISTS "Admins can update insights" ON public.community_insights;
DROP POLICY IF EXISTS "Admins can delete insights" ON public.community_insights;

-- Allow viewers with topic access to read insights
CREATE POLICY "Insights readable by topic viewers"
ON public.community_insights
FOR SELECT
USING (public.user_has_topic_access(topic_id, 'viewer'));

-- Admins can insert insights manually (service role bypasses RLS automatically)
CREATE POLICY "Admins can insert insights"
ON public.community_insights
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can update insights
CREATE POLICY "Admins can update insights"
ON public.community_insights
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete insights
CREATE POLICY "Admins can delete insights"
ON public.community_insights
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- RPC to cleanup expired insights older than 7 days
CREATE FUNCTION public.cleanup_expired_community_insights()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.community_insights
  WHERE created_at < now() - interval '7 days';
END;
$$;