-- 1. Invite token on waitlist
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS invite_token text;

UPDATE public.waitlist
  SET invite_token = encode(gen_random_bytes(16), 'hex')
  WHERE invite_token IS NULL;

ALTER TABLE public.waitlist
  ALTER COLUMN invite_token SET DEFAULT encode(gen_random_bytes(16), 'hex');

ALTER TABLE public.waitlist
  ALTER COLUMN invite_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_invite_token_key
  ON public.waitlist (invite_token);

-- 2. Responses table
CREATE TABLE IF NOT EXISTS public.waitlist_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waitlist_id uuid REFERENCES public.waitlist(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  wants_early_access boolean NOT NULL DEFAULT false,
  is_preview boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlist_responses_waitlist_id_idx
  ON public.waitlist_responses (waitlist_id);

GRANT SELECT ON public.waitlist_responses TO authenticated;
GRANT ALL ON public.waitlist_responses TO service_role;

ALTER TABLE public.waitlist_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read waitlist responses"
  ON public.waitlist_responses
  FOR SELECT
  TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin'::app_role)
    OR public.has_role((select auth.uid()), 'superadmin'::app_role)
  );

CREATE POLICY "Service role manages waitlist responses"
  ON public.waitlist_responses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_waitlist_responses_updated_at
  BEFORE UPDATE ON public.waitlist_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();