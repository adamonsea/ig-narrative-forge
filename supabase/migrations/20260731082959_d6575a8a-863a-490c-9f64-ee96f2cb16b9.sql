CREATE TABLE IF NOT EXISTS public.image_generation_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid,
  topic_id uuid,
  model text NOT NULL,
  provider text,
  quality text,
  size text,
  is_automated boolean NOT NULL DEFAULT false,
  used_fallback boolean NOT NULL DEFAULT false,
  prep_ms integer,
  generation_ms integer,
  total_ms integer,
  output_bytes integer,
  credits integer,
  cost_usd numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_generation_metrics_created_at
  ON public.image_generation_metrics (created_at DESC);

GRANT SELECT ON public.image_generation_metrics TO authenticated;
GRANT ALL ON public.image_generation_metrics TO service_role;

ALTER TABLE public.image_generation_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view image generation metrics"
  ON public.image_generation_metrics
  FOR SELECT
  TO authenticated
  USING (public.has_role((select auth.uid()), 'admin') OR public.has_role((select auth.uid()), 'superadmin'));

CREATE POLICY "Service role manages image generation metrics"
  ON public.image_generation_metrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);