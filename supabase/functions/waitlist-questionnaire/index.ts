import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.23.8';
import { Resend } from 'npm:resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const PREVIEW_PREFIX = 'preview-';
const ADMIN_EMAIL = 'adamonsea@gmail.com';

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LABELS: Record<string, string> = {
  feed_kind: 'Feed type',
  feed_name: 'Feed name',
  audience: 'Audience',
  today: 'How they do it today',
  resonated: 'What resonated',
  blockers: 'Blockers',
  blockers_detail: 'Blocker detail',
  price_band: 'Price band',
  wishlist: 'Wishlist',
};

async function notifyAdmin(
  email: string | null,
  answers: Record<string, unknown>,
  wantsEarlyAccess: boolean,
  isPreview: boolean,
) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    console.warn('RESEND_API_KEY not configured - skipping questionnaire notification');
    return;
  }
  try {
    const rows = Object.entries(LABELS)
      .map(([field, label]) => {
        const raw = answers[field];
        const value = Array.isArray(raw) ? raw.join(', ') : (raw ?? '');
        if (!value) return '';
        return `<tr><td style="padding:8px 12px;border-bottom:1px solid #ececE7;font-size:13px;color:#71717a;white-space:nowrap;vertical-align:top;">${esc(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #ececE7;font-size:14px;color:#0f172a;">${esc(String(value))}</td></tr>`;
      })
      .join('');

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f5f5f3;padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e6e6e1;border-radius:14px;padding:28px;">
    <h1 style="margin:0 0 4px 0;font-size:20px;color:#0f172a;">Questionnaire completed${isPreview ? ' (preview)' : ''}</h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">${esc(email ?? 'Anonymous preview')} · early access: ${wantsEarlyAccess ? 'yes' : 'no'}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
    <p style="margin:20px 0 0 0;font-size:13px;color:#71717a;">View all responses in the admin waitlist panel.</p>
  </div>
</div>`;

    const { error } = await new Resend(key).emails.send({
      from: 'Curatr <noreply@curatr.pro>',
      to: [ADMIN_EMAIL],
      subject: `Waitlist questionnaire: ${email ?? 'preview'}`,
      html,
    });
    if (error) console.error('Questionnaire notification error:', error);
  } catch (err) {
    console.error('Questionnaire notification failed:', err);
  }
}

const AnswersSchema = z.object({
  feed_kind: z.array(z.string().max(60)).max(6).default([]),
  feed_name: z.string().max(160).optional().default(''),
  audience: z.array(z.string().max(60)).max(6).default([]),
  today: z.array(z.string().max(60)).max(6).default([]),
  resonated: z.array(z.string().max(60)).max(2).default([]),
  blockers: z.array(z.string().max(60)).max(6).default([]),
  blockers_detail: z.string().max(600).optional().default(''),
  price_band: z.string().max(30).optional().default(''),
  wishlist: z.string().max(1000).optional().default(''),
});

const SubmitSchema = z.object({
  token: z.string().min(6).max(120),
  answers: AnswersSchema,
  wants_early_access: z.boolean().default(false),
  partial: z.boolean().default(false),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('token') ?? '';
      if (!token) return json({ error: 'Missing token' }, 400);

      if (token.startsWith(PREVIEW_PREFIX)) {
        return json({ valid: true, preview: true, email: null, completed: false });
      }

      const { data: entry } = await supabase
        .from('waitlist')
        .select('id, email')
        .eq('invite_token', token)
        .maybeSingle();

      if (!entry) return json({ error: 'This link is no longer valid' }, 404);

      const { data: existing } = await supabase
        .from('waitlist_responses')
        .select('id, completed_at, answers')
        .eq('waitlist_id', entry.id)
        .maybeSingle();

      return json({
        valid: true,
        preview: false,
        email: entry.email,
        completed: !!existing?.completed_at,
        answers: existing?.answers ?? null,
      });
    }

    if (req.method === 'POST') {
      const parsed = SubmitSchema.safeParse(await req.json());
      if (!parsed.success) {
        return json({ error: 'Invalid submission', details: parsed.error.flatten().fieldErrors }, 400);
      }
      const { token, answers, wants_early_access, partial } = parsed.data;

      if (token.startsWith(PREVIEW_PREFIX)) {
        if (partial) return json({ success: true, preview: true, partial: true });
        await supabase.from('waitlist_responses').insert({
          waitlist_id: null,
          answers,
          wants_early_access,
          is_preview: true,
          completed_at: new Date().toISOString(),
        });
        return json({ success: true, preview: true });
      }

      const { data: entry } = await supabase
        .from('waitlist')
        .select('id, email')
        .eq('invite_token', token)
        .maybeSingle();

      if (!entry) return json({ error: 'This link is no longer valid' }, 404);

      const { data: prior } = await supabase
        .from('waitlist_responses')
        .select('id, completed_at')
        .eq('waitlist_id', entry.id)
        .maybeSingle();

      const row = {
        waitlist_id: entry.id,
        answers,
        wants_early_access,
        is_preview: false,
        completed_at: partial ? (prior?.completed_at ?? null) : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = prior
        ? await supabase.from('waitlist_responses').update(row).eq('id', prior.id)
        : await supabase.from('waitlist_responses').insert(row);

      if (error) {
        console.error('waitlist-questionnaire insert failed:', error);
        return json({ error: 'Could not save your answers' }, 500);
      }

      if (!partial && !prior?.completed_at) {
        await notifyAdmin(entry.email ?? null, answers as Record<string, unknown>, wants_early_access, false);
      }

      return json({ success: true, partial });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('waitlist-questionnaire error:', err);
    return json({ error: 'Something went wrong' }, 500);
  }
});