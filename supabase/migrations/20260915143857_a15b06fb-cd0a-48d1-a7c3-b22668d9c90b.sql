CREATE TABLE public.scrape_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid,
  topic_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  method text,
  methods_tried text[] NOT NULL DEFAULT '{}',
  urls_discovered integer NOT NULL DEFAULT 0,
  urls_new integer NOT NULL DEFAULT 0,
  articles_stored integer NOT NULL DEFAULT 0,
  rejections jsonb NOT NULL DEFAULT '{}'::jsonb,
  not_modified boolean NOT NULL DEFAULT false,
  ai_pages_used integer NOT NULL DEFAULT 0,
  error_code text,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.scrape_runs TO authenticated;
GRANT ALL ON public.scrape_runs TO service_role;

ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can view scrape runs"
ON public.scrape_runs FOR SELECT TO authenticated
USING (
  public.has_role((select auth.uid()), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.topics t
    WHERE t.id = scrape_runs.topic_id
      AND t.created_by = (select auth.uid())
  )
);

CREATE POLICY "Service role manages scrape runs"
ON public.scrape_runs FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_scrape_runs_source_started ON public.scrape_runs (source_id, started_at DESC);
CREATE INDEX idx_scrape_runs_topic_started ON public.scrape_runs (topic_id, started_at DESC);

CREATE TRIGGER update_scrape_runs_updated_at
BEFORE UPDATE ON public.scrape_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();