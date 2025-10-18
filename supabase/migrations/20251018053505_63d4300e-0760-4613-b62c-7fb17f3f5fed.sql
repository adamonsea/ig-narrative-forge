-- Create topic_roundups table for pre-rendered daily and weekly roundups
CREATE TABLE IF NOT EXISTS public.topic_roundups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  roundup_type TEXT NOT NULL CHECK (roundup_type IN ('daily', 'weekly')),
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  story_ids UUID[] NOT NULL DEFAULT '{}',
  slide_data JSONB NOT NULL DEFAULT '[]',
  stats JSONB NOT NULL DEFAULT '{}',
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(topic_id, roundup_type, period_start)
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_topic_roundups_lookup 
ON public.topic_roundups(topic_id, roundup_type, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_topic_roundups_published 
ON public.topic_roundups(topic_id, is_published, period_start DESC) 
WHERE is_published = true;

-- Enable RLS
ALTER TABLE public.topic_roundups ENABLE ROW LEVEL SECURITY;

-- Public can read published roundups for public topics
CREATE POLICY "Published roundups from public topics are publicly viewable"
ON public.topic_roundups
FOR SELECT
USING (
  is_published = true 
  AND EXISTS (
    SELECT 1 FROM public.topics t 
    WHERE t.id = topic_roundups.topic_id 
    AND t.is_public = true 
    AND t.is_active = true
  )
);

-- Topic owners can manage their roundups
CREATE POLICY "Topic owners can manage their roundups"
ON public.topic_roundups
FOR ALL
USING (
  topic_id IN (
    SELECT id FROM public.topics 
    WHERE created_by = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR auth.role() = 'service_role'
);

-- Add updated_at trigger
CREATE TRIGGER update_topic_roundups_updated_at
BEFORE UPDATE ON public.topic_roundups
FOR EACH ROW
EXECUTE FUNCTION public.update_events_updated_at_column();

COMMENT ON TABLE public.topic_roundups IS 'Stores pre-rendered daily and weekly roundups with slides for notification delivery';