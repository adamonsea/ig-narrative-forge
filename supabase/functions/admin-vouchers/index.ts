// Voucher code management. Restricted to the product owner account only.
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUser } from '../_shared/auth.ts';
import { planById } from '../_shared/plans.ts';

const OWNER_EMAIL = 'adamonsea@gmail.com';

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
    if (user.email.toLowerCase() !== OWNER_EMAIL) return json({ error: 'Forbidden' }, 403);

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list');

    if (action === 'list') {
      const { data, error } = await service
        .from('voucher_codes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return json({ vouchers: data ?? [] });
    }

    if (action === 'create') {
      const code = String(body.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
        return json({ error: 'Codes can use 3–32 letters, numbers, dashes or underscores.' }, 400);
      }
      const kind = body.kind === 'discount' ? 'discount' : 'free_access';
      const plan = body.plan ? planById(String(body.plan))?.id ?? null : null;
      const maxRedemptions =
        body.maxRedemptions === null || body.maxRedemptions === undefined || body.maxRedemptions === ''
          ? null
          : Math.max(1, Number(body.maxRedemptions));
      const expiresAt = body.expiresAt ? new Date(body.expiresAt).toISOString() : null;
      const notes = body.notes ? String(body.notes).slice(0, 300) : null;

      let stripeCouponId: string | null = null;
      let stripePromotionCodeId: string | null = null;
      let percentOff: number | null = null;
      let amountOffCents: number | null = null;
      let durationMonths: number | null = null;
      let freeMonths: number | null = null;

      if (kind === 'discount') {
        percentOff = body.percentOff ? Math.min(100, Math.max(1, Number(body.percentOff))) : null;
        amountOffCents = body.amountOffCents ? Math.max(1, Number(body.amountOffCents)) : null;
        if (!percentOff && !amountOffCents) {
          return json({ error: 'Set either a percentage off or an amount off.' }, 400);
        }
        durationMonths = body.durationMonths ? Math.max(1, Number(body.durationMonths)) : null;

        const coupon = await stripe.coupons.create({
          name: `Curatr ${code}`,
          percent_off: percentOff ?? undefined,
          amount_off: percentOff ? undefined : amountOffCents ?? undefined,
          currency: percentOff ? undefined : 'usd',
          duration: durationMonths && durationMonths > 1 ? 'repeating' : 'once',
          duration_in_months: durationMonths && durationMonths > 1 ? durationMonths : undefined,
        });
        stripeCouponId = coupon.id;

        const promo = await stripe.promotionCodes.create({
          coupon: coupon.id,
          code,
          max_redemptions: maxRedemptions ?? undefined,
          expires_at: expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : undefined,
        });
        stripePromotionCodeId = promo.id;
      } else {
        freeMonths = body.freeMonths ? Math.max(1, Number(body.freeMonths)) : 1;
      }

      const { data, error } = await service
        .from('voucher_codes')
        .insert({
          code,
          kind,
          plan,
          free_months: freeMonths,
          percent_off: percentOff,
          amount_off_cents: amountOffCents,
          duration_months: durationMonths,
          max_redemptions: maxRedemptions,
          expires_at: expiresAt,
          notes,
          stripe_coupon_id: stripeCouponId,
          stripe_promotion_code_id: stripePromotionCodeId,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) {
        if (String(error.message).includes('duplicate')) {
          return json({ error: 'That code already exists.' }, 400);
        }
        throw error;
      }
      return json({ voucher: data });
    }

    if (action === 'toggle') {
      const id = String(body.id || '');
      const isActive = !!body.isActive;
      if (!id) return json({ error: 'Missing code.' }, 400);
      const { data, error } = await service
        .from('voucher_codes')
        .update({ is_active: isActive })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      if (data?.stripe_promotion_code_id) {
        await stripe.promotionCodes
          .update(data.stripe_promotion_code_id, { active: isActive })
          .catch((e) => console.error('promo toggle failed', e));
      }
      return json({ voucher: data });
    }

    if (action === 'delete') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'Missing code.' }, 400);
      const { data } = await service
        .from('voucher_codes')
        .select('stripe_promotion_code_id')
        .eq('id', id)
        .maybeSingle();
      if (data?.stripe_promotion_code_id) {
        await stripe.promotionCodes
          .update(data.stripe_promotion_code_id, { active: false })
          .catch((e) => console.error('promo deactivate failed', e));
      }
      const { error } = await service.from('voucher_codes').delete().eq('id', id);
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('admin-vouchers failed', e);
    return json({ error: 'Something went wrong managing voucher codes.' }, 500);
  }
});
