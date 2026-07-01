-- Automated source health checks: flags sources producing 0 articles with a reason
CREATE TABLE IF NOT EXISTS public.source_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL,
  topic_id uuid,
  source_name text NOT NULL,
  canonical_domain text,
  status text NOT NULL DEFAULT 'unknown',
  reason_code text NOT NULL DEFAULT 'unknown',
  reason_detail text,
  articles_last_window integer NOT NULL DEFAULT 0,
  window_days integer NOT NULL DEFAULT 7,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_health_checks_source_unique UNIQUE (source_id)
);

GRANT SELECT ON public.source_health_checks TO authenticated;
GRANT ALL ON public.source_health_checks TO service_role;

ALTER TABLE public.source_health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner and admins read all source health"
ON public.source_health_checks
FOR SELECT
TO authenticated
USING (
  (select auth.jwt() ->> 'email') = 'adamonsea@gmail.com'
  OR public.has_role((select auth.uid()), 'admin')
  OR public.has_role((select auth.uid()), 'superadmin')
);

CREATE POLICY "Topic owners read their source health"
ON public.source_health_checks
FOR SELECT
TO authenticated
USING (
  topic_id IN (
    SELECT id FROM public.topics WHERE created_by = (select auth.uid())
  )
);

CREATE INDEX IF NOT EXISTS idx_source_health_checks_topic ON public.source_health_checks(topic_id);
CREATE INDEX IF NOT EXISTS idx_source_health_checks_status ON public.source_health_checks(status);

CREATE TRIGGER trg_source_health_checks_updated_at
BEFORE UPDATE ON public.source_health_checks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();