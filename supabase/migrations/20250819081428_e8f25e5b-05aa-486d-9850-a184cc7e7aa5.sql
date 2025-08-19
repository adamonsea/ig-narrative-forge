-- Create quality_reports table for Phase 4 analytics
CREATE TABLE public.quality_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL,
  overall_score INTEGER NOT NULL DEFAULT 0,
  brand_safety_score INTEGER NOT NULL DEFAULT 0,
  content_quality_score INTEGER NOT NULL DEFAULT 0,
  regional_relevance_score INTEGER NOT NULL DEFAULT 0,
  brand_safety_issues JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  compliance_data JSONB DEFAULT '{}'::jsonb,
  analysis_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add quality tracking to stories table
ALTER TABLE public.stories 
ADD COLUMN quality_score INTEGER DEFAULT NULL,
ADD COLUMN last_quality_check TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Enable RLS on quality_reports
ALTER TABLE public.quality_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for quality_reports
CREATE POLICY "Quality reports viewable by authenticated users" 
ON public.quality_reports 
FOR SELECT 
USING (true);

CREATE POLICY "Quality reports manageable by authenticated users" 
ON public.quality_reports 
FOR ALL 
USING (true);

-- Create indexes for better performance
CREATE INDEX idx_quality_reports_story_id ON public.quality_reports(story_id);
CREATE INDEX idx_quality_reports_overall_score ON public.quality_reports(overall_score);
CREATE INDEX idx_quality_reports_created_at ON public.quality_reports(created_at);
CREATE INDEX idx_stories_quality_score ON public.stories(quality_score);

-- Add trigger for updated_at on quality_reports
CREATE TRIGGER update_quality_reports_updated_at
BEFORE UPDATE ON public.quality_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial feature flags for new functionality
INSERT INTO public.feature_flags (flag_name, enabled, description, config) VALUES
('intelligent_scraping', true, 'Enable intelligent multi-method scraping', '{"max_retries": 3, "timeout_ms": 15000}'),
('quality_analysis', true, 'Enable automated content quality analysis', '{"min_score": 70, "brand_safety_required": true}'),
('analytics_dashboard', true, 'Enable performance analytics dashboard', '{"update_frequency": "hourly"}'),
('regional_enhancement', true, 'Enable AI-powered regional context enhancement', '{"relevance_threshold": 60}')
ON CONFLICT (flag_name) DO NOTHING;