-- Fix RLS policies for feed_cta_configs to allow proper access
DROP POLICY IF EXISTS "Topic owners can manage feed CTA configs" ON feed_cta_configs;
DROP POLICY IF EXISTS "Users can view accessible topic CTA configs" ON feed_cta_configs;

-- Create new, clearer RLS policies for feed_cta_configs
CREATE POLICY "Authenticated users can manage feed CTA configs"
  ON feed_cta_configs
  FOR ALL
  USING (
    auth.uid() IS NOT NULL AND (
      topic_id IS NULL OR -- Global configs
      topic_id IN (
        SELECT id FROM topics WHERE created_by = auth.uid()
      ) OR
      has_role(auth.uid(), 'admin'::app_role)
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      topic_id IS NULL OR -- Global configs  
      topic_id IN (
        SELECT id FROM topics WHERE created_by = auth.uid()
      ) OR
      has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- Create scraping automation table for better scraping control
CREATE TABLE IF NOT EXISTS scraping_automation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  scrape_frequency_hours INTEGER DEFAULT 12,
  last_scraped_at TIMESTAMP WITH TIME ZONE,
  next_scrape_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '12 hours'),
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on scraping_automation
ALTER TABLE scraping_automation ENABLE ROW LEVEL SECURITY;

-- RLS policies for scraping_automation
CREATE POLICY "Users can manage their own topic scraping automation"
  ON scraping_automation
  FOR ALL
  USING (
    auth.uid() IS NOT NULL AND (
      topic_id IN (
        SELECT id FROM topics WHERE created_by = auth.uid()
      ) OR
      has_role(auth.uid(), 'admin'::app_role)
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      topic_id IN (
        SELECT id FROM topics WHERE created_by = auth.uid()
      ) OR
      has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_scraping_automation_updated_at
    BEFORE UPDATE ON scraping_automation
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();