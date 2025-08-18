-- Create scheduling tables for automated scraping
CREATE TABLE IF NOT EXISTS public.scrape_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL,
  schedule_type TEXT NOT NULL DEFAULT 'twice_daily',
  frequency_hours INTEGER NOT NULL DEFAULT 12,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '12 hours'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  run_count INTEGER NOT NULL DEFAULT 0,
  success_rate NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create job queue for scraping tasks
CREATE TABLE IF NOT EXISTS public.scrape_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL,
  source_id UUID NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'scrape',
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  result_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create source attribution audit table
CREATE TABLE IF NOT EXISTS public.source_attributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL,
  extracted_publication TEXT NOT NULL,
  source_url TEXT NOT NULL,
  detected_domain TEXT NOT NULL,
  validation_status TEXT NOT NULL DEFAULT 'pending',
  is_valid BOOLEAN,
  manual_override_by UUID,
  override_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_scrape_schedules_next_run ON public.scrape_schedules(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON public.scrape_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_source_attributions_article ON public.source_attributions(article_id);
CREATE INDEX IF NOT EXISTS idx_source_attributions_validation ON public.source_attributions(validation_status);

-- Create RLS policies for scheduling tables
ALTER TABLE public.scrape_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_attributions ENABLE ROW LEVEL SECURITY;

-- Admin and service role access for schedules
CREATE POLICY "Scrape schedules admin access" ON public.scrape_schedules FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Scrape schedules service role access" ON public.scrape_schedules FOR ALL USING (auth.role() = 'service_role');

-- Admin and service role access for jobs
CREATE POLICY "Scrape jobs admin access" ON public.scrape_jobs FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Scrape jobs service role access" ON public.scrape_jobs FOR ALL USING (auth.role() = 'service_role');

-- Admin access for attributions
CREATE POLICY "Source attributions admin access" ON public.source_attributions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Source attributions read access" ON public.source_attributions FOR SELECT USING (true);

-- Create triggers for updated_at
CREATE TRIGGER update_scrape_schedules_updated_at
  BEFORE UPDATE ON public.scrape_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_source_attributions_updated_at
  BEFORE UPDATE ON public.source_attributions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default schedules for existing active sources
INSERT INTO public.scrape_schedules (source_id, schedule_type, frequency_hours, next_run_at)
SELECT 
  id,
  'twice_daily',
  12,
  now() + (random() * interval '6 hours') -- Stagger initial runs
FROM public.content_sources 
WHERE is_active = true
ON CONFLICT DO NOTHING;