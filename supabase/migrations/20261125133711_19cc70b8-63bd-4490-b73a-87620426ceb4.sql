ALTER TABLE public.api_usage ADD COLUMN IF NOT EXISTS user_id uuid, ADD COLUMN IF NOT EXISTS topic_id uuid;
CREATE INDEX IF NOT EXISTS api_usage_user_created_idx ON public.api_usage(user_id, created_at);

ALTER TABLE public.user_credits ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false;
INSERT INTO public.user_credits (user_id, credits_balance, total_credits_purchased, total_credits_used, billing_exempt)
VALUES ('c8284651-7ca9-407d-99ac-85c19cbe212c', 0, 0, 0, true)
ON CONFLICT (user_id) DO UPDATE SET billing_exempt = true;

CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id uuid,
  topic_id uuid,
  actor text NOT NULL,
  kind text NOT NULL,
  credits integer NOT NULL DEFAULT 0,
  stories integer NOT NULL DEFAULT 0,
  shadow boolean NOT NULL DEFAULT true,
  outcome text NOT NULL DEFAULT 'metered',
  ref_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.usage_events TO service_role;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX usage_events_payer_idx ON public.usage_events(payer_id, created_at);
CREATE INDEX usage_events_topic_idx ON public.usage_events(topic_id, created_at);

INSERT INTO public.feature_flags (flag_name, enabled, description, config)
SELECT 'billing_enforce', false, 'Charge credits for automatic work (off = shadow mode)', '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE flag_name='billing_enforce');
INSERT INTO public.feature_flags (flag_name, enabled, description, config)
SELECT 'pause_free_automation', false, 'Pause all free-account automation', '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE flag_name='pause_free_automation');

CREATE OR REPLACE FUNCTION public.get_shadow_usage_summary(p_days integer DEFAULT 7)
RETURNS TABLE(payer_id uuid, topic_id uuid, topic_name text, kind text, actor text, events bigint, credits bigint, stories bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role((select auth.uid()), 'superadmin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  RETURN QUERY
  SELECT e.payer_id, e.topic_id, t.name, e.kind, e.actor, count(*), sum(e.credits)::bigint, sum(e.stories)::bigint
  FROM public.usage_events e LEFT JOIN public.topics t ON t.id = e.topic_id
  WHERE e.created_at > now() - make_interval(days => greatest(1, least(p_days, 90)))
  GROUP BY 1,2,3,4,5 ORDER BY 7 DESC;
END $$;
REVOKE ALL ON FUNCTION public.get_shadow_usage_summary(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_shadow_usage_summary(integer) TO authenticated;