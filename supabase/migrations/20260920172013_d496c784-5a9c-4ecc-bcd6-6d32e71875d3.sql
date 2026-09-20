ALTER TYPE public.illustration_style_enum ADD VALUE IF NOT EXISTS 'cartoon';
ALTER TYPE public.illustration_style_enum ADD VALUE IF NOT EXISTS 'bw_editorial_photo';
ALTER TYPE public.illustration_style_enum ADD VALUE IF NOT EXISTS 'anime';
ALTER TYPE public.illustration_style_enum ADD VALUE IF NOT EXISTS 'illustrated_icon';

CREATE TABLE public.credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  grant_type text NOT NULL,
  source_key text NOT NULL,
  original_amount integer NOT NULL,
  remaining_amount integer NOT NULL,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_key)
);
GRANT SELECT ON public.credit_grants TO authenticated;
GRANT ALL ON public.credit_grants TO service_role;
ALTER TABLE public.credit_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_grants_select_own ON public.credit_grants FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY credit_grants_service_all ON public.credit_grants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX credit_grants_spend_order_idx ON public.credit_grants(user_id, expires_at NULLS LAST, created_at) WHERE remaining_amount > 0;
CREATE TRIGGER credit_grants_set_updated_at BEFORE UPDATE ON public.credit_grants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'settled',
  ADD COLUMN IF NOT EXISTS grant_allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_idempotency_idx ON public.credit_transactions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS credit_transactions_reserved_idx ON public.credit_transactions(status, created_at) WHERE status = 'reserved';

CREATE OR REPLACE FUNCTION public.has_pro_access(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.subscribers s
      WHERE s.user_id = p_user_id
        AND s.subscribed = true
        AND s.plan IN ('pro', 'starter', 'team')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p_user_id AND ur.role = 'superadmin'
    )
  );
$$;
REVOKE ALL ON FUNCTION public.has_pro_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_pro_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.grant_user_credits(
  p_user_id uuid,
  p_amount integer,
  p_grant_type text,
  p_source_key text,
  p_description text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant_id uuid;
  v_balance integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Server authorization required');
  END IF;
  IF p_user_id IS NULL OR p_amount <= 0 OR length(trim(p_source_key)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credit grant');
  END IF;

  INSERT INTO public.credit_grants(user_id, grant_type, source_key, original_amount, remaining_amount, expires_at, metadata)
  VALUES (p_user_id, p_grant_type, p_source_key, p_amount, p_amount, p_expires_at, coalesce(p_metadata, '{}'::jsonb))
  ON CONFLICT (user_id, source_key) DO NOTHING
  RETURNING id INTO v_grant_id;

  IF v_grant_id IS NULL THEN
    SELECT coalesce(sum(remaining_amount), 0)::integer INTO v_balance
    FROM public.credit_grants WHERE user_id = p_user_id AND (expires_at IS NULL OR expires_at > now());
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'new_balance', v_balance);
  END IF;

  INSERT INTO public.user_credits(user_id, credits_balance, total_credits_purchased)
  VALUES (p_user_id, p_amount, CASE WHEN p_grant_type = 'top_up' THEN p_amount ELSE 0 END)
  ON CONFLICT (user_id) DO UPDATE SET
    credits_balance = public.user_credits.credits_balance + excluded.credits_balance,
    total_credits_purchased = public.user_credits.total_credits_purchased + excluded.total_credits_purchased,
    updated_at = now()
  RETURNING credits_balance INTO v_balance;

  INSERT INTO public.credit_transactions(user_id, transaction_type, credits_amount, credits_balance_after, description, metadata, idempotency_key, status, settled_at)
  VALUES (p_user_id, 'grant', p_amount, v_balance, p_description, coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('grant_id', v_grant_id, 'grant_type', p_grant_type), 'grant:' || p_source_key, 'settled', now());

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'grant_id', v_grant_id, 'new_balance', v_balance);
END;
$$;
REVOKE ALL ON FUNCTION public.grant_user_credits(uuid, integer, text, text, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_user_credits(uuid, integer, text, text, text, timestamptz, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_user_credits(
  p_user_id uuid,
  p_amount integer,
  p_idempotency_key text,
  p_description text DEFAULT NULL,
  p_story_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_available integer;
  v_remaining integer := p_amount;
  v_balance integer;
  v_tx_id uuid;
  v_allocations jsonb := '[]'::jsonb;
  v_grant record;
  v_take integer;
  v_existing record;
BEGIN
  IF v_caller IS NOT NULL AND v_caller <> p_user_id AND NOT public.has_role(v_caller, 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_user_id IS NULL OR p_amount <= 0 OR length(trim(p_idempotency_key)) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credit reservation');
  END IF;

  SELECT id, status, credits_balance_after INTO v_existing
  FROM public.credit_transactions
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing.id, 'status', v_existing.status, 'new_balance', v_existing.credits_balance_after);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  SELECT coalesce(sum(remaining_amount), 0)::integer INTO v_available
  FROM public.credit_grants
  WHERE user_id = p_user_id AND remaining_amount > 0 AND (expires_at IS NULL OR expires_at > now());
  IF v_available < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient credits', 'current_balance', v_available, 'required', p_amount);
  END IF;

  FOR v_grant IN
    SELECT id, remaining_amount FROM public.credit_grants
    WHERE user_id = p_user_id AND remaining_amount > 0 AND (expires_at IS NULL OR expires_at > now())
    ORDER BY expires_at ASC NULLS LAST, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining = 0;
    v_take := least(v_grant.remaining_amount, v_remaining);
    UPDATE public.credit_grants SET remaining_amount = remaining_amount - v_take, updated_at = now() WHERE id = v_grant.id;
    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object('grant_id', v_grant.id, 'amount', v_take));
    v_remaining := v_remaining - v_take;
  END LOOP;

  v_balance := v_available - p_amount;
  INSERT INTO public.user_credits(user_id, credits_balance, total_credits_used)
  VALUES (p_user_id, v_balance, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET credits_balance = v_balance, total_credits_used = public.user_credits.total_credits_used + p_amount, updated_at = now();

  INSERT INTO public.credit_transactions(user_id, transaction_type, credits_amount, credits_balance_after, description, related_story_id, idempotency_key, status, grant_allocations)
  VALUES (p_user_id, 'usage', -p_amount, v_balance, p_description, p_story_id, p_idempotency_key, 'reserved', v_allocations)
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'transaction_id', v_tx_id, 'status', 'reserved', 'new_balance', v_balance);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_user_credits(uuid, integer, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_user_credits(uuid, integer, text, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_credit_reservation(p_user_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row record;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  UPDATE public.credit_transactions SET status = 'settled', settled_at = now()
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key AND status = 'reserved'
  RETURNING id, credits_balance_after INTO v_row;
  IF NOT FOUND THEN
    SELECT id, credits_balance_after INTO v_row FROM public.credit_transactions WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key AND status = 'settled';
  END IF;
  RETURN jsonb_build_object('success', v_row.id IS NOT NULL, 'transaction_id', v_row.id, 'new_balance', v_row.credits_balance_after);
END;
$$;
REVOKE ALL ON FUNCTION public.settle_credit_reservation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_credit_reservation(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_credit_reservation(p_user_id uuid, p_idempotency_key text, p_reason text DEFAULT 'Generation did not complete')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_tx record; v_item jsonb; v_amount integer := 0; v_balance integer;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.has_role(auth.uid(), 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT * INTO v_tx FROM public.credit_transactions WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Reservation not found'); END IF;
  IF v_tx.status = 'released' THEN RETURN jsonb_build_object('success', true, 'duplicate', true, 'new_balance', v_tx.credits_balance_after); END IF;
  IF v_tx.status <> 'reserved' THEN RETURN jsonb_build_object('success', false, 'error', 'Reservation is not releasable'); END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_tx.grant_allocations)
  LOOP
    UPDATE public.credit_grants SET remaining_amount = remaining_amount + (v_item->>'amount')::integer, updated_at = now() WHERE id = (v_item->>'grant_id')::uuid;
    v_amount := v_amount + (v_item->>'amount')::integer;
  END LOOP;
  UPDATE public.user_credits SET credits_balance = credits_balance + v_amount, total_credits_used = greatest(0, total_credits_used - v_amount), updated_at = now() WHERE user_id = p_user_id RETURNING credits_balance INTO v_balance;
  UPDATE public.credit_transactions SET status = 'released', released_at = now(), description = coalesce(description, '') || ' — ' || p_reason, credits_balance_after = v_balance WHERE id = v_tx.id;
  RETURN jsonb_build_object('success', true, 'released', v_amount, 'new_balance', v_balance);
END;
$$;
REVOKE ALL ON FUNCTION public.release_credit_reservation(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_credit_reservation(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_topic_distribution(p_topic_id uuid, p_field text, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid; v_caller uuid := auth.uid();
BEGIN
  IF p_field NOT IN ('is_public','email_subscriptions_enabled','rss_enabled','public_widget_builder_enabled','mcp_enabled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported distribution setting');
  END IF;
  SELECT created_by INTO v_owner FROM public.topics WHERE id = p_topic_id;
  IF v_owner IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Feed not found'); END IF;
  IF v_caller IS NULL OR (v_caller <> v_owner AND NOT public.has_role(v_caller, 'superadmin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;
  IF p_enabled AND NOT public.has_pro_access(v_owner) THEN
    RETURN jsonb_build_object('success', false, 'error', 'pro_required');
  END IF;

  IF p_field = 'is_public' THEN UPDATE public.topics SET is_public = p_enabled, is_active = p_enabled, updated_at = now() WHERE id = p_topic_id;
  ELSIF p_field = 'email_subscriptions_enabled' THEN UPDATE public.topics SET email_subscriptions_enabled = p_enabled, updated_at = now() WHERE id = p_topic_id;
  ELSIF p_field = 'rss_enabled' THEN UPDATE public.topics SET rss_enabled = p_enabled, updated_at = now() WHERE id = p_topic_id;
  ELSIF p_field = 'public_widget_builder_enabled' THEN UPDATE public.topics SET public_widget_builder_enabled = p_enabled, updated_at = now() WHERE id = p_topic_id;
  ELSIF p_field = 'mcp_enabled' THEN UPDATE public.topics SET mcp_enabled = p_enabled, updated_at = now() WHERE id = p_topic_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'enabled', p_enabled);
END;
$$;
REVOKE ALL ON FUNCTION public.set_topic_distribution(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_topic_distribution(uuid, text, boolean) TO authenticated;
