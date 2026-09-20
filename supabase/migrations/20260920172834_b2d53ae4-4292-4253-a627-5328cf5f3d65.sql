CREATE OR REPLACE FUNCTION public.redeem_free_access_voucher(
  p_user_id uuid,
  p_email text,
  p_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_voucher public.voucher_codes%ROWTYPE;
  v_months integer;
  v_end timestamptz;
  v_plan text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Server authorization required');
  END IF;

  SELECT * INTO v_voucher
  FROM public.voucher_codes
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND OR NOT v_voucher.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'That code is not valid.');
  END IF;
  IF v_voucher.kind <> 'free_access' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This code is applied at checkout.');
  END IF;
  IF v_voucher.expires_at IS NOT NULL AND v_voucher.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'That code has expired.');
  END IF;
  IF v_voucher.max_redemptions IS NOT NULL AND v_voucher.redeemed_count >= v_voucher.max_redemptions THEN
    RETURN jsonb_build_object('success', false, 'error', 'That code has already been fully used.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.voucher_redemptions WHERE voucher_code_id = v_voucher.id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have already used that code.');
  END IF;

  v_months := greatest(1, coalesce(v_voucher.free_months, 1));
  v_end := now() + make_interval(months => v_months);
  v_plan := CASE WHEN lower(coalesce(v_voucher.plan, 'pro')) IN ('starter','pro','team') THEN 'pro' ELSE 'pro' END;

  INSERT INTO public.voucher_redemptions(voucher_code_id, user_id, email)
  VALUES (v_voucher.id, p_user_id, p_email);

  UPDATE public.voucher_codes
  SET redeemed_count = redeemed_count + 1, updated_at = now()
  WHERE id = v_voucher.id;

  INSERT INTO public.subscribers(user_id, email, subscribed, plan, status, source, voucher_code_id, current_period_end, updated_at)
  VALUES (p_user_id, p_email, true, v_plan, 'voucher', 'voucher', v_voucher.id, v_end, now())
  ON CONFLICT (user_id) DO UPDATE SET
    email = excluded.email,
    subscribed = true,
    plan = excluded.plan,
    status = excluded.status,
    source = excluded.source,
    voucher_code_id = excluded.voucher_code_id,
    current_period_end = greatest(coalesce(public.subscribers.current_period_end, now()), now()) + make_interval(months => v_months),
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'plan', v_plan, 'months', v_months, 'current_period_end', v_end);
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_free_access_voucher(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_free_access_voucher(uuid, text, text) TO service_role;

DO $$
DECLARE v_row record; v_existing integer;
BEGIN
  FOR v_row IN SELECT user_id, credits_balance FROM public.user_credits WHERE credits_balance > 0 LOOP
    SELECT coalesce(sum(remaining_amount), 0)::integer INTO v_existing
    FROM public.credit_grants
    WHERE user_id = v_row.user_id AND (expires_at IS NULL OR expires_at > now());
    IF v_existing < v_row.credits_balance THEN
      INSERT INTO public.credit_grants(user_id, grant_type, source_key, original_amount, remaining_amount, metadata)
      VALUES (v_row.user_id, 'legacy', 'legacy-balance-v1', v_row.credits_balance - v_existing, v_row.credits_balance - v_existing, jsonb_build_object('migrated', true))
      ON CONFLICT (user_id, source_key) DO NOTHING;
    END IF;
  END LOOP;
END $$;