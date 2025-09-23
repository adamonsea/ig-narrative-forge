-- Phase 1: Reddit Community Intelligence - MINIMAL database extension
-- Add community intelligence fields to topics table (non-breaking changes)

ALTER TABLE public.topics 
ADD COLUMN IF NOT EXISTS community_intelligence_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS community_config jsonb DEFAULT '{"subreddits": [], "last_processed": null, "processing_frequency_hours": 24}'::jsonb;

-- Create community insights table for storing processed Reddit data
CREATE TABLE IF NOT EXISTS public.community_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'reddit',
  source_identifier text NOT NULL, -- subreddit name
  insight_type text NOT NULL CHECK (insight_type IN ('sentiment', 'concern', 'validation')),
  content text NOT NULL,
  confidence_score integer DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + interval '7 days'),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS community_insights_topic_id_created_at_idx 
ON public.community_insights(topic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS community_insights_expires_at_idx 
ON public.community_insights(expires_at) WHERE expires_at IS NOT NULL;

-- RLS policies for community insights
ALTER TABLE public.community_insights ENABLE ROW LEVEL SECURITY;

-- Topic owners can manage their community insights
CREATE POLICY "Topic owners can manage community insights" 
ON public.community_insights 
FOR ALL 
USING (
  topic_id IN (
    SELECT topics.id 
    FROM topics 
    WHERE topics.created_by = auth.uid()
  ) 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR auth.role() = 'service_role'
)
WITH CHECK (
  topic_id IN (
    SELECT topics.id 
    FROM topics 
    WHERE topics.created_by = auth.uid()
  ) 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR auth.role() = 'service_role'
);

-- Service role can clean up expired insights
CREATE OR REPLACE FUNCTION public.cleanup_expired_community_insights()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.community_insights 
  WHERE expires_at IS NOT NULL AND expires_at < now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log cleanup if any insights were deleted
  IF deleted_count > 0 THEN
    INSERT INTO system_logs (level, message, context, function_name)
    VALUES (
      'info',
      'Cleaned up expired community insights',
      jsonb_build_object('deleted_count', deleted_count),
      'cleanup_expired_community_insights'
    );
  END IF;
  
  RETURN deleted_count;
END;
$$;