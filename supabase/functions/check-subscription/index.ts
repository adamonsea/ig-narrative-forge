// Reads the signed-in account's live subscription state from Stripe and stores it.
// Voucher-granted access that has not expired always wins.
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUser } from '../_shared/auth.ts';
import { MONTHLY_PRO_CREDITS, TOP_UP_CREDITS, TOP_UP_PRICE_ID, WELCOME_CREDITS, planByPriceId } from '../_shared/plans.ts';

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

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { sessionId } = await req.json().catch(() => ({}));
    const welcome = await service.rpc('grant_user_credits', {
      p_user_id: user.id,
      p_amount: WELCOME_CREDITS,
      p_grant_type: 'welcome',
      p_source_key: 'welcome:v1',
      p_description: 'Welcome credits',
      p_metadata: { version: 1 },
    });
    if (welcome.error) console.error('Welcome credit grant failed', welcome.error);

    const { data: row } = await service
      .from('subscribers')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Unexpired voucher access short-circuits the Stripe lookup.
    if (
      row?.source === 'voucher' &&
      row.subscribed &&
      row.current_period_end &&
      new Date(row.current_period_end) > new Date()
    ) {
      return json({
        subscribed: true,
        plan: row.plan,
        source: 'voucher',
        current_period_end: row.current_period_end,
      });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    if (typeof sessionId === 'string' && sessionId.startsWith('cs_')) {
      const checkout = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });
      if (checkout.metadata?.user_id !== user.id) return json({ error: 'Checkout does not belong to this account.' }, 403);
      if (checkout.mode === 'payment' && checkout.payment_status === 'paid') {
        const purchasedTopUp = checkout.line_items?.data.some((item) => item.price?.id === TOP_UP_PRICE_ID);
        if (purchasedTopUp) {
          const grant = await service.rpc('grant_user_credits', {
            p_user_id: user.id,
            p_amount: TOP_UP_CREDITS,
            p_grant_type: 'top_up',
            p_source_key: `checkout:${checkout.id}`,
            p_description: `${TOP_UP_CREDITS} credit top-up`,
            p_metadata: { checkout_session_id: checkout.id },
          });
          if (grant.error || !grant.data?.success) throw grant.error || new Error(grant.data?.error || 'Credit grant failed');
        }
      }
    }

    let customerId = row?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const found = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = found.data[0]?.id;
    }

    let subscribed = false;
    let plan: string | null = null;
    let status: string | null = null;
    let periodEnd: string | null = null;
    let subscriptionId: string | null = null;

    if (customerId) {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 10,
      });
      const sub = subs.data.find((candidate) => candidate.status === 'active' || candidate.status === 'trialing');
      if (sub) {
        subscribed = true;
        status = sub.status;
        subscriptionId = sub.id;
        periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        plan = planByPriceId(sub.items.data[0]?.price?.id)?.id ?? null;
        if (plan) {
          const grant = await service.rpc('grant_user_credits', {
            p_user_id: user.id,
            p_amount: MONTHLY_PRO_CREDITS,
            p_grant_type: 'subscription',
            p_source_key: `subscription:${sub.id}:${sub.current_period_start}`,
            p_description: 'Pro creative credits',
            p_expires_at: periodEnd,
            p_metadata: { subscription_id: sub.id, period_start: sub.current_period_start, period_end: sub.current_period_end },
          });
          if (grant.error || !grant.data?.success) console.error('Subscription credit grant failed', grant.error || grant.data);
        }
      }
    }

    await service.from('subscribers').upsert(
      {
        user_id: user.id,
        email: user.email,
        stripe_customer_id: customerId ?? null,
        stripe_subscription_id: subscriptionId,
        subscribed,
        plan,
        status,
        source: 'stripe',
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    return json({ subscribed, plan, source: 'stripe', current_period_end: periodEnd });
  } catch (e) {
    console.error('check-subscription failed', e);
    return json({ error: 'Could not check your plan right now.' }, 500);
  }
});
