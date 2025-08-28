-- Phase 1: Add topic-level CTA management to feed_cta_configs
ALTER TABLE public.feed_cta_configs 
ADD COLUMN topic_id uuid REFERENCES public.topics(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX idx_feed_cta_configs_topic_id ON public.feed_cta_configs(topic_id);

-- Update RLS policies to allow topic owners to manage their CTAs
DROP POLICY IF EXISTS "Feed CTA configs manageable by admins" ON public.feed_cta_configs;
DROP POLICY IF EXISTS "Feed CTA configs viewable by authenticated users" ON public.feed_cta_configs;

-- New policy: Topic owners can manage their topic's CTA configs
CREATE POLICY "Topic owners can manage feed CTA configs" 
ON public.feed_cta_configs 
FOR ALL 
USING (
  auth.uid() IS NOT NULL AND (
    -- Topic creator can manage
    topic_id IN (
      SELECT id FROM public.topics 
      WHERE created_by = auth.uid()
    ) OR
    -- Admin can manage all
    has_role(auth.uid(), 'admin'::app_role) OR
    -- Global CTAs (topic_id is null) only manageable by admins
    (topic_id IS NULL AND has_role(auth.uid(), 'admin'::app_role))
  )
);

-- Anyone can view CTA configs for topics they have access to
CREATE POLICY "Users can view accessible topic CTA configs" 
ON public.feed_cta_configs 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    -- Can view their own topic's CTAs
    topic_id IN (
      SELECT id FROM public.topics 
      WHERE created_by = auth.uid()
    ) OR
    -- Can view public topic CTAs
    topic_id IN (
      SELECT id FROM public.topics 
      WHERE is_public = true
    ) OR
    -- Admin can view all
    has_role(auth.uid(), 'admin'::app_role) OR
    -- Can view global CTAs
    topic_id IS NULL
  )
);

-- Service role access
CREATE POLICY "Service role access for feed CTA configs" 
ON public.feed_cta_configs 
FOR ALL 
USING (auth.role() = 'service_role');