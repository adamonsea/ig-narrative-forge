-- Phase 3: Create discarded_articles table for suppression system
CREATE TABLE IF NOT EXISTS public.discarded_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  normalized_url TEXT NOT NULL,
  original_url TEXT NOT NULL,
  title TEXT,
  discarded_by UUID,
  discarded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reason TEXT DEFAULT 'user_discard',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast lookups during scraping
CREATE INDEX IF NOT EXISTS idx_discarded_articles_topic_url 
ON public.discarded_articles(topic_id, normalized_url);

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_discarded_articles_created_at 
ON public.discarded_articles(created_at);

-- Enable RLS
ALTER TABLE public.discarded_articles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Topic owners can manage their discarded articles" 
ON public.discarded_articles 
FOR ALL 
USING (
  topic_id IN (
    SELECT id FROM public.topics WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  topic_id IN (
    SELECT id FROM public.topics WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Service role can access discarded articles" 
ON public.discarded_articles 
FOR ALL 
USING (auth.role() = 'service_role');