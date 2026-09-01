CREATE TABLE public.email_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_domain text,
  signup_source text,
  intro_heading text,
  intro_text text,
  include_events boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_segments TO authenticated;
GRANT ALL ON public.email_segments TO service_role;

ALTER TABLE public.email_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their email segments"
ON public.email_segments FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.topics t WHERE t.id = email_segments.topic_id AND t.created_by = (select auth.uid()))
  OR public.has_role((select auth.uid()), 'admin'::app_role)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.topics t WHERE t.id = email_segments.topic_id AND t.created_by = (select auth.uid()))
  OR public.has_role((select auth.uid()), 'admin'::app_role)
);

CREATE INDEX idx_email_segments_topic ON public.email_segments(topic_id);

CREATE TRIGGER update_email_segments_updated_at
BEFORE UPDATE ON public.email_segments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS events_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS events_last_new_count integer NOT NULL DEFAULT 0;