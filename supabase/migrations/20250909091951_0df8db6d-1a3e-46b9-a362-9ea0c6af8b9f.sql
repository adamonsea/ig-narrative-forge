-- Step 1: Create Multi-Tenant Junction Architecture

-- Create topic_sources junction table for many-to-many relationships
CREATE TABLE IF NOT EXISTS public.topic_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.content_sources(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source_config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(topic_id, source_id)
);

-- Enable RLS on topic_sources
ALTER TABLE public.topic_sources ENABLE ROW LEVEL SECURITY;

-- RLS policies for topic_sources
CREATE POLICY "Topic owners can manage their topic sources" 
ON public.topic_sources 
FOR ALL 
USING (
  (topic_id IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  )) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  (auth.role() = 'service_role'::text)
)
WITH CHECK (
  (topic_id IN (
    SELECT id FROM topics WHERE created_by = auth.uid()
  )) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  (auth.role() = 'service_role'::text)
);

-- Migrate existing content_sources.topic_id relationships to junction table
INSERT INTO public.topic_sources (topic_id, source_id, is_active, source_config)
SELECT 
  cs.topic_id,
  cs.id as source_id,
  cs.is_active,
  jsonb_build_object(
    'migrated_from_content_sources', true,
    'migration_date', now(),
    'original_credibility_score', cs.credibility_score
  )
FROM public.content_sources cs
WHERE cs.topic_id IS NOT NULL
ON CONFLICT (topic_id, source_id) DO NOTHING;

-- Universal function to get sources for a topic
CREATE OR REPLACE FUNCTION public.get_topic_sources(p_topic_id UUID)
RETURNS TABLE(
  source_id UUID,
  source_name TEXT,
  canonical_domain TEXT,
  feed_url TEXT,
  is_active BOOLEAN,
  credibility_score INTEGER,
  articles_scraped INTEGER,
  last_scraped_at TIMESTAMP WITH TIME ZONE,
  source_config JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.id as source_id,
    cs.source_name,
    cs.canonical_domain,
    cs.feed_url,
    ts.is_active,
    cs.credibility_score,
    cs.articles_scraped,
    cs.last_scraped_at,
    ts.source_config
  FROM topic_sources ts
  JOIN content_sources cs ON cs.id = ts.source_id
  WHERE ts.topic_id = p_topic_id
    AND ts.is_active = true
  ORDER BY cs.source_name;
END;
$$;

-- Universal function to add source to topic
CREATE OR REPLACE FUNCTION public.add_source_to_topic(
  p_topic_id UUID,
  p_source_id UUID,
  p_source_config JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO topic_sources (topic_id, source_id, source_config)
  VALUES (p_topic_id, p_source_id, p_source_config)
  ON CONFLICT (topic_id, source_id) 
  DO UPDATE SET 
    is_active = true,
    source_config = EXCLUDED.source_config,
    updated_at = now();
  
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- Universal function to remove source from topic
CREATE OR REPLACE FUNCTION public.remove_source_from_topic(
  p_topic_id UUID,
  p_source_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE topic_sources 
  SET is_active = false, updated_at = now()
  WHERE topic_id = p_topic_id AND source_id = p_source_id;
  
  RETURN FOUND;
END;
$$;

-- Universal function to get topics for a source (many-to-many)
CREATE OR REPLACE FUNCTION public.get_source_topics(p_source_id UUID)
RETURNS TABLE(
  topic_id UUID,
  topic_name TEXT,
  topic_type TEXT,
  region TEXT,
  is_active BOOLEAN,
  source_config JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as topic_id,
    t.name as topic_name,
    t.topic_type,
    t.region,
    ts.is_active,
    ts.source_config
  FROM topic_sources ts
  JOIN topics t ON t.id = ts.topic_id
  WHERE ts.source_id = p_source_id
    AND ts.is_active = true
  ORDER BY t.name;
END;
$$;

-- Add trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_topic_sources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_topic_sources_updated_at
  BEFORE UPDATE ON public.topic_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.update_topic_sources_updated_at();

-- Log the migration
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Multi-tenant junction architecture created',
  jsonb_build_object(
    'migration_step', 'step_1_junction_architecture',
    'tables_created', 'topic_sources',
    'functions_created', 4,
    'policies_created', 1
  ),
  'multi_tenant_migration_step_1'
);