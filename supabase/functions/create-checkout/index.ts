// Starts a Stripe Checkout session for a Curatr plan.
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUser } from '../_shared/auth.ts';
import { planById, priceIdFor, TOP_UP_CREDITS, TOP_UP_PRICE_ID, type BillingInterval } from '../_shared/plans.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const user = await getUser(req);
    if (!user?.email) return json({ error: 'Unauthorized' }, 401);

    const { plan: planId, voucherCode, returnUrl, interval, kind } = await req.json().catch(() => ({}));
    const billingInterval: BillingInterval = interval === 'year' ? 'year' : 'month';
    const isTopUp = kind === 'top_up';
    const plan = isTopUp ? null : planById(planId);
    if (!isTopUp && !plan) return json({ error: 'Unknown plan' }, 400);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });
    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    if (isTopUp) {
      const { data: hasPro, error: accessError } = await service.rpc('has_pro_access', { p_user_id: user.id });
      if (accessError || !hasPro) return json({ error: 'Pro is required before you can add credits.' }, 403);
    }

    // Reuse an existing Stripe customer where we can.
    let customerId: string | undefined;
    const { data: existing } = await service
      .from('subscribers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing?.stripe_customer_id) {
      customerId = existing.stripe_customer_id;
    } else {
      const found = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = found.data[0]?.id;
    }
    if (!isTopUp && customerId) {
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
      if (subscriptions.data.some((item) => item.status === 'active' || item.status === 'trialing')) {
        return json({ error: 'You already have Pro. Manage it from your dashboard.' }, 409);
      }
    }

    // Discount vouchers are applied through their Stripe promotion code.
    let discounts: { promotion_code: string }[] | undefined;
    const code = (voucherCode || '').trim().toUpperCase();
    if (code) {
      const { data: voucher } = await service
        .from('voucher_codes')
        .select('*')
        .eq('code', code)
        .maybeSingle();
      const usable =
        voucher &&
        voucher.is_active &&
        voucher.kind === 'discount' &&
        voucher.stripe_promotion_code_id &&
        (!voucher.expires_at || new Date(voucher.expires_at) > new Date()) &&
        (voucher.max_redemptions === null || voucher.redeemed_count < voucher.max_redemptions) &&
        (!voucher.plan || voucher.plan === plan?.id);
      if (!usable) return json({ error: 'That code cannot be used on this plan.' }, 400);
      discounts = [{ promotion_code: voucher!.stripe_promotion_code_id as string }];
    }

    const origin = returnUrl || req.headers.get('origin') || 'https://curatr.pro';
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: isTopUp ? TOP_UP_PRICE_ID : priceIdFor(plan!, billingInterval), quantity: 1 }],
      mode: isTopUp ? 'payment' : 'subscription',
      allow_promotion_codes: discounts ? undefined : true,
      discounts,
      success_url: `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      metadata: { user_id: user.id, kind: isTopUp ? 'top_up' : 'subscription', plan: plan?.id || '', interval: billingInterval, credits: isTopUp ? String(TOP_UP_CREDITS) : '', voucher_code: code || '' },
      subscription_data: isTopUp ? undefined : { metadata: { user_id: user.id, plan: plan?.id || 'pro', interval: billingInterval } },
    });

    return json({ url: session.url });
  } catch (e) {
    console.error('create-checkout failed', e);
    return json({ error: 'Could not start checkout. Please try again.' }, 500);
  }
});
