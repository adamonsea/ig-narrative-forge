// Redeems a voucher code for the signed-in account.
// Free-access codes grant a plan immediately; discount codes are applied at checkout.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUser } from '../_shared/auth.ts';
import { planById } from '../_shared/plans.ts';

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

    const { code: rawCode } = await req.json().catch(() => ({}));
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code || code.length > 64) return json({ error: 'Enter a valid code.' }, 400);

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data: voucher } = await service
      .from('voucher_codes')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    const invalid = json({ error: 'That code is not valid.' }, 400);
    if (!voucher || !voucher.is_active) return invalid;
    if (voucher.expires_at && new Date(voucher.expires_at) <= new Date()) {
      return json({ error: 'That code has expired.' }, 400);
    }
    if (voucher.max_redemptions !== null && voucher.redeemed_count >= voucher.max_redemptions) {
      return json({ error: 'That code has already been fully used.' }, 400);
    }

    const { data: already } = await service
      .from('voucher_redemptions')
      .select('id')
      .eq('voucher_code_id', voucher.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (already) return json({ error: 'You have already used that code.' }, 400);

    if (voucher.kind === 'discount') {
      return json({
        applied: false,
        kind: 'discount',
        message: 'Discount code accepted — choose a plan and it will be applied at checkout.',
      });
    }

    // Free access: grant the plan straight away.
    const plan = planById(voucher.plan) ?? planById('pro');
    if (!plan) return invalid;
    const { data: redemption, error: redeemError } = await service.rpc('redeem_free_access_voucher', {
      p_user_id: user.id,
      p_email: user.email,
      p_code: code,
    });
    if (redeemError || !redemption?.success) return json({ error: redemption?.error || 'That code could not be applied.' }, 400);
    const months = redemption.months;

    return json({
      applied: true,
      kind: 'free_access',
      plan: plan.id,
      current_period_end: redemption.current_period_end,
      message: `${plan.name} unlocked for ${months} month${months === 1 ? '' : 's'}.`,
    });
  } catch (e) {
    console.error('redeem-voucher failed', e);
    return json({ error: 'Could not check that code right now.' }, 500);
  }
});
