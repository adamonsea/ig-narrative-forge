// Allowance + metering module (Phase 0). One entry point for every automatic or
// user-triggered AI action: who pays, whether to charge, and a usage_events row.
// Shadow mode: while `billing_enforce` is off, system work is metered (shadow=true)
// and never charged. User-triggered charges keep their existing behaviour.

export type Actor = 'user' | 'system';

export interface BillingActor {
  actor: Actor;
  /** Signed-in user for user calls; null for system calls until a topic owner is found. */
  userId: string | null;
  /** True only for a signed-in superadmin. System calls never bypass. */
  bypass: boolean;
}

/** Tell system calls (service-role key) from user calls (verified user token). */
export async function resolveBillingActor(service: any, token: string, verifyUser: () => Promise<string | null>): Promise<BillingActor | null> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (serviceKey && token === serviceKey) return { actor: 'system', userId: null, bypass: false };
  const userId = await verifyUser();
  if (!userId) return null;
  const { data } = await service.rpc('has_role', { _user_id: userId, _role: 'superadmin' });
  return { actor: 'user', userId, bypass: data === true };
}

export async function topicOwner(service: any, topicId: string | null | undefined): Promise<string | null> {
  if (!topicId) return null;
  const { data } = await service.from('topics').select('created_by').eq('id', topicId).maybeSingle();
  return data?.created_by ?? null;
}

/** Enforcement is on globally, or for one test account (user_credits.billing_enforce_test). */
export async function isBillingEnforced(service: any, userId?: string | null): Promise<boolean> {
  if (Deno.env.get('BILLING_ENFORCE') === 'false') return false;
  if (userId) {
    const { data, error } = await service.rpc('billing_enforced_for', { p_user: userId });
    if (!error) return data === true;
  }
  const { data } = await service.from('feature_flags').select('enabled').eq('flag_name', 'billing_enforce').maybeSingle();
  return data?.enabled === true;
}

export interface MeterInput {
  payerId: string | null;
  topicId?: string | null;
  actor: Actor;
  kind: string; // picture | animation | rewrite | suggestion | event_copy | caption
  credits?: number;
  stories?: number;
  refId?: string | null;
  /** Set when the caller really charged credits (existing user flow). */
  charged?: boolean;
  /** Charge a user-triggered action too when enforcement is on (e.g. suggestions). */
  chargeUser?: boolean;
  /** Superadmin user call: metered, never charged. */
  bypass?: boolean;
}

export interface MeterResult {
  /** Charge credits now (enforcement on, system call, payer not exempt). */
  charge: boolean;
  /** Would this owner be paused if enforcement were on? */
  wouldPause: boolean;
  exempt: boolean;
}

/** Record one usage event and decide whether a system call should be charged. Never throws. */
export async function meterUsage(service: any, input: MeterInput): Promise<MeterResult> {
  const credits = input.credits ?? 0;
  let exempt = false;
  let wouldPause = false;
  let enforce = false;
  try {
    enforce = await isBillingEnforced(service, input.payerId);
    if (input.payerId) {
      const { data } = await service.from('user_credits').select('credits_balance, billing_exempt').eq('user_id', input.payerId).maybeSingle();
      exempt = data?.billing_exempt === true;
      wouldPause = !exempt && credits > 0 && (data?.credits_balance ?? 0) < credits;
    }
  } catch (_) { /* metering never blocks work */ }

  const charge = enforce && (input.actor === 'system' || (input.chargeUser === true && !input.bypass))
    && !!input.payerId && !exempt && credits > 0 && !input.charged;
  let chargedNow = false;
  if (charge && input.chargeUser) {
    // Reserve + settle in one go for small after-the-fact charges.
    const key = `${input.kind}:${input.refId ?? ''}:${crypto.randomUUID()}`;
    const { data } = await service.rpc('reserve_user_credits', {
      p_user_id: input.payerId, p_amount: credits, p_idempotency_key: key,
      p_description: `Automatic ${input.kind}`, p_story_id: null,
    });
    if (data?.success) {
      await service.rpc('settle_credit_reservation', { p_user_id: input.payerId, p_idempotency_key: key });
      chargedNow = true;
    }
  }
  const outcome = !input.payerId ? 'no_owner'
    : input.charged || chargedNow ? 'charged'
    : charge ? 'unpaid'
    : exempt ? 'exempt'
    : wouldPause ? 'would_pause'
    : 'metered';
  try {
    await service.from('usage_events').insert({
      payer_id: input.payerId,
      topic_id: input.topicId ?? null,
      actor: input.actor,
      kind: input.kind,
      credits,
      stories: input.stories ?? 0,
      shadow: !(input.charged || chargedNow || charge),
      outcome,
      ref_id: input.refId ?? null,
    });
  } catch (e) {
    console.warn('usage_events insert failed (non-critical):', e);
  }
  if (input.payerId && (credits > 0 || (input.stories ?? 0) > 0)) await checkUsageAlerts(service, input.payerId);
  return { charge, wouldPause, exempt };
}

/** Log a provider call to api_usage with payer and feed. Never throws. */
export async function logApiUsage(service: any, row: { service_name: string; operation: string; cost_usd?: number; tokens_used?: number; user_id?: string | null; topic_id?: string | null; region?: string | null }) {
  try {
    const { error } = await service.from('api_usage').insert({ tokens_used: 0, cost_usd: 0, region: null, ...row });
    if (error) console.warn('api_usage insert failed (non-critical):', error.message);
  } catch (e) {
    console.warn('api_usage insert failed (non-critical):', e);
  }
}

export type AutomationKind = 'gather' | 'rewrite' | 'picture' | 'publish';

export interface GateResult {
  /** Skip this feed's automatic work now (only ever true when billing_enforce is on). */
  skip: boolean;
  /** Why it would pause (null = runs). Logged in shadow mode as would_pause. */
  reason: string | null;
}

const gateCache = new Map<string, GateResult>();

/**
 * Gate check for schedulers: skip, never fail. In shadow mode it only records
 * a "would have paused" row (once per owner, kind and reason per day).
 */
export async function automationGate(service: any, topicId: string | null | undefined, kind: AutomationKind): Promise<GateResult> {
  if (!topicId) return { skip: false, reason: null };
  const cacheKey = `${topicId}:${kind}`;
  const cached = gateCache.get(cacheKey);
  if (cached) return cached;
  let result: GateResult = { skip: false, reason: null };
  try {
    const owner = await topicOwner(service, topicId);
    const { data: reason, error } = await service.rpc('automation_pause_reason', { p_user: owner, p_kind: kind });
    if (error) throw error;
    if (reason && reason !== 'no_owner') {
      const enforce = await isBillingEnforced(service, owner);
      result = { skip: enforce, reason };
      const ref = `${kind}:${reason}`;
      const since = new Date(); since.setUTCHours(0, 0, 0, 0);
      const { count } = await service.from('usage_events').select('id', { count: 'exact', head: true })
        .eq('payer_id', owner).eq('kind', 'gate').eq('ref_id', ref).gte('created_at', since.toISOString());
      if (!count) {
        await service.from('usage_events').insert({
          payer_id: owner, topic_id: topicId, actor: 'system', kind: 'gate',
          shadow: !enforce, outcome: enforce ? 'paused' : 'would_pause', ref_id: ref,
        });
      }
      console.log(`[billing] ${enforce ? 'paused' : 'would have paused'} ${kind} for topic ${topicId}: ${reason}`);
    }
  } catch (e) {
    console.warn('automationGate failed open (non-critical):', e);
  }
  gateCache.set(cacheKey, result);
  return result;
}

/** Record newly crossed 75/90/100% thresholds and email the owner once per threshold per month. */
export async function checkUsageAlerts(service: any, userId: string | null) {
  if (!userId) return;
  try {
    const { data: fresh } = await service.rpc('record_usage_alerts', { p_user: userId });
    if (!fresh?.length) return;
    const key = Deno.env.get('RESEND_API_KEY');
    const { data: u } = await service.auth.admin.getUserById(userId);
    const email = u?.user?.email;
    if (!key || !email) return;
    const top = fresh.reduce((a: any, b: any) => (b.threshold > a.threshold ? b : a));
    const what = top.metric === 'stories' ? 'stories' : 'credits';
    const subject = top.threshold >= 100 ? `You've used all your ${what} this month` : `You've used ${top.threshold}% of your ${what}`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Curatr <noreply@curatr.pro>', to: [email], subject,
        html: `<p style="font:16px/1.5 sans-serif">${subject}.</p><p style="font:16px/1.5 sans-serif"><a href="https://curatr.pro/dashboard">See usage</a></p>`,
      }),
    });
    if (res.ok) {
      await service.from('usage_alerts').update({ emailed_at: new Date().toISOString() })
        .eq('user_id', userId).eq('period', new Date().toISOString().slice(0, 7))
        .in('threshold', fresh.map((f: any) => f.threshold)).is('emailed_at', null);
    }
  } catch (e) {
    console.warn('usage alert failed (non-critical):', e);
  }
}
