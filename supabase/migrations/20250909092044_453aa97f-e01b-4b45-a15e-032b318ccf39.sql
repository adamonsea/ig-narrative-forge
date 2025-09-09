-- Step 1: Create Multi-Tenant Junction Architecture (Fixed)

-- Create topic_sources junction table if it doesn't exist
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

-- Enable RLS on topic_sources (safe if already enabled)
ALTER TABLE public.topic_sources ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists, then recreate
DROP POLICY IF EXISTS "Topic owners can manage their topic sources" ON public.topic_sources;

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

-- Add trigger for updated_at timestamp (drop first if exists)
DROP TRIGGER IF EXISTS update_topic_sources_updated_at ON public.topic_sources;
DROP FUNCTION IF EXISTS public.update_topic_sources_updated_at();

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
  'Multi-tenant junction architecture created (fixed)',
  jsonb_build_object(
    'migration_step', 'step_1_junction_architecture_fixed',
    'tables_created_or_verified', 'topic_sources',
    'policies_recreated', 1
  ),
  'multi_tenant_migration_step_1_fixed'
);