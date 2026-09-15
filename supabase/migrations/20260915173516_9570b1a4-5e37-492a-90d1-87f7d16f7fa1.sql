CREATE TABLE public.image_bench_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  story_id uuid,
  topic_id uuid,
  story_title text,
  model text NOT NULL,
  quality text NOT NULL,
  size text NOT NULL DEFAULT '1536x1024',
  prompt text,
  image_url text,
  cost_usd numeric,
  duration_ms integer,
  success boolean NOT NULL DEFAULT true,
  error text,
  verdict text CHECK (verdict IN ('good','acceptable','reject')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_bench_results TO authenticated;
GRANT ALL ON public.image_bench_results TO service_role;

ALTER TABLE public.image_bench_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage bench results"
ON public.image_bench_results
FOR ALL
TO authenticated
USING (public.has_role((select auth.uid()), 'superadmin'))
WITH CHECK (public.has_role((select auth.uid()), 'superadmin'));

CREATE INDEX idx_image_bench_results_run ON public.image_bench_results (run_id, created_at DESC);

CREATE TRIGGER update_image_bench_results_updated_at
BEFORE UPDATE ON public.image_bench_results
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();