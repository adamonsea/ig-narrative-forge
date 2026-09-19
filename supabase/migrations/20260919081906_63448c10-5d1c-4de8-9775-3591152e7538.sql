CREATE TABLE public.feed_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  input_value text NOT NULL,
  input_type text NOT NULL DEFAULT 'topic',
  blueprint jsonb,
  user_id uuid,
  topic_id uuid,
  nudge_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.feed_leads TO service_role;
GRANT SELECT ON public.feed_leads TO authenticated;

ALTER TABLE public.feed_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Product owner can view feed leads"
ON public.feed_leads FOR SELECT
TO authenticated
USING ((select auth.jwt() ->> 'email') = 'adamonsea@gmail.com');

CREATE POLICY "Service role manages feed leads"
ON public.feed_leads FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_feed_leads_created_at ON public.feed_leads (created_at DESC);
CREATE INDEX idx_feed_leads_email ON public.feed_leads (email);

CREATE TRIGGER update_feed_leads_updated_at
BEFORE UPDATE ON public.feed_leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();