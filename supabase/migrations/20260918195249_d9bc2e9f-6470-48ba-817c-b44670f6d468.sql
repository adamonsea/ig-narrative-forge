
CREATE TABLE public.subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscribed boolean NOT NULL DEFAULT false,
  plan text,
  status text,
  source text NOT NULL DEFAULT 'stripe',
  voucher_code_id uuid,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscribers TO authenticated;
GRANT ALL ON public.subscribers TO service_role;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscribers_select_own" ON public.subscribers
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'superadmin'));
CREATE POLICY "subscribers_service_all" ON public.subscribers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.voucher_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'free_access',
  plan text,
  free_months integer,
  percent_off integer,
  amount_off_cents integer,
  duration_months integer,
  max_redemptions integer,
  redeemed_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_codes TO authenticated;
GRANT ALL ON public.voucher_codes TO service_role;
ALTER TABLE public.voucher_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voucher_codes_superadmin_all" ON public.voucher_codes
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'superadmin'))
  WITH CHECK (public.has_role((select auth.uid()), 'superadmin'));
CREATE POLICY "voucher_codes_service_all" ON public.voucher_codes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.voucher_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_code_id uuid NOT NULL REFERENCES public.voucher_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voucher_code_id, user_id)
);
GRANT SELECT ON public.voucher_redemptions TO authenticated;
GRANT ALL ON public.voucher_redemptions TO service_role;
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voucher_redemptions_select_own" ON public.voucher_redemptions
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'superadmin'));
CREATE POLICY "voucher_redemptions_service_all" ON public.voucher_redemptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_subscribers_user ON public.subscribers(user_id);
CREATE INDEX idx_voucher_redemptions_voucher ON public.voucher_redemptions(voucher_code_id);

CREATE TRIGGER subscribers_set_updated_at BEFORE UPDATE ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER voucher_codes_set_updated_at BEFORE UPDATE ON public.voucher_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
