-- Create daily content availability tracking table
CREATE TABLE IF NOT EXISTS public.daily_content_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES content_sources(id) ON DELETE CASCADE,
  check_date date NOT NULL DEFAULT CURRENT_DATE,
  new_urls_found integer NOT NULL DEFAULT 0,
  total_urls_discovered integer NOT NULL DEFAULT 0,
  urls_already_seen integer NOT NULL DEFAULT 0,
  discovery_method text,
  check_duration_ms integer,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique constraint for one check per topic/source/date
CREATE UNIQUE INDEX IF NOT EXISTS daily_content_availability_unique_check 
ON public.daily_content_availability(topic_id, source_id, check_date);

-- Enable RLS
ALTER TABLE public.daily_content_availability ENABLE ROW LEVEL SECURITY;

-- Policy for topic owners to view their availability data
CREATE POLICY "Topic owners can view content availability" 
ON public.daily_content_availability
FOR SELECT 
USING (
  topic_id IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Policy for service role to manage all data
CREATE POLICY "Service role can manage content availability" 
ON public.daily_content_availability
FOR ALL 
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_daily_content_availability_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_daily_content_availability_updated_at
  BEFORE UPDATE ON public.daily_content_availability
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_content_availability_updated_at();