-- Create community_pulse_keywords table for structured pulse data
CREATE TABLE IF NOT EXISTS public.community_pulse_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  total_mentions integer DEFAULT 0,
  positive_mentions integer DEFAULT 0,
  negative_mentions integer DEFAULT 0,
  representative_quote text,
  most_active_thread_url text,
  most_active_thread_title text,
  analysis_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_community_pulse_topic_date 
  ON public.community_pulse_keywords(topic_id, analysis_date DESC);

-- Enable RLS
ALTER TABLE public.community_pulse_keywords ENABLE ROW LEVEL SECURITY;

-- Policy: Topic owners can view their pulse keywords
CREATE POLICY "Topic owners can view pulse keywords"
  ON public.community_pulse_keywords
  FOR SELECT
  USING (
    topic_id IN (
      SELECT id FROM public.topics WHERE created_by = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Policy: Service role can manage pulse keywords
CREATE POLICY "Service role can manage pulse keywords"
  ON public.community_pulse_keywords
  FOR ALL
  USING (auth.role() = 'service_role');

-- Policy: Public topics with published pulse keywords are viewable
CREATE POLICY "Public pulse keywords are viewable"
  ON public.community_pulse_keywords
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.topics t
      WHERE t.id = community_pulse_keywords.topic_id
        AND t.is_public = true
        AND t.is_active = true
    )
  );