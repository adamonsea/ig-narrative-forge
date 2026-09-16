ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS mcp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mcp_access text NOT NULL DEFAULT 'key';

ALTER TABLE public.topics
  DROP CONSTRAINT IF EXISTS topics_mcp_access_check;
ALTER TABLE public.topics
  ADD CONSTRAINT topics_mcp_access_check CHECK (mcp_access IN ('open','key'));

CREATE TABLE IF NOT EXISTS public.topic_mcp_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  label text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topic_mcp_keys_topic ON public.topic_mcp_keys(topic_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_topic_mcp_keys_hash ON public.topic_mcp_keys(key_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_mcp_keys TO authenticated;
GRANT ALL ON public.topic_mcp_keys TO service_role;

ALTER TABLE public.topic_mcp_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Topic owners manage their mcp keys" ON public.topic_mcp_keys;
CREATE POLICY "Topic owners manage their mcp keys"
ON public.topic_mcp_keys FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_mcp_keys.topic_id AND t.created_by = (select auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_mcp_keys.topic_id AND t.created_by = (select auth.uid())));

CREATE TABLE IF NOT EXISTS public.mcp_entitlements (
  user_id uuid PRIMARY KEY,
  granted_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mcp_entitlements TO authenticated;
GRANT ALL ON public.mcp_entitlements TO service_role;

ALTER TABLE public.mcp_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own entitlement" ON public.mcp_entitlements;
CREATE POLICY "Users can view their own entitlement"
ON public.mcp_entitlements FOR SELECT TO authenticated
USING (user_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS "Admins manage entitlements" ON public.mcp_entitlements;
CREATE POLICY "Admins manage entitlements"
ON public.mcp_entitlements FOR ALL TO authenticated
USING (public.has_role((select auth.uid()), 'admin'))
WITH CHECK (public.has_role((select auth.uid()), 'admin'));

DROP TRIGGER IF EXISTS update_topic_mcp_keys_updated_at ON public.topic_mcp_keys;
CREATE TRIGGER update_topic_mcp_keys_updated_at
BEFORE UPDATE ON public.topic_mcp_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_mcp_entitlements_updated_at ON public.mcp_entitlements;
CREATE TRIGGER update_mcp_entitlements_updated_at
BEFORE UPDATE ON public.mcp_entitlements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();