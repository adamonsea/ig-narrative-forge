// Weekly digest of waitlist runs that were started but never finished, so they
// can be followed up by hand. Scheduled via pg_cron.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Resend } from 'npm:resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAIL = 'adamonsea@gmail.com';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const summarise = (answers: Record<string, unknown> | null) => {
  if (!answers) return '—';
  return Object.entries(answers)
    .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : Boolean(v)))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join(' · ');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    // Started but not completed, and not already reported.
    const { data: rows, error } = await supabase
      .from('waitlist_responses')
      .select('id, answers, updated_at, created_at, waitlist_id, waitlist:waitlist_id(email, created_at, confirmation_sent_at)')
      .is('completed_at', null)
      .eq('is_preview', false)
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('waitlist-digest query failed:', error);
      return new Response(JSON.stringify({ error: 'Query failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Also surface anyone whose confirmation email failed to send.
    const { data: failed } = await supabase
      .from('waitlist')
      .select('email, created_at, confirmation_error')
      .not('confirmation_error', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    const unfinished = rows ?? [];
    if (unfinished.length === 0 && (failed?.length ?? 0) === 0) {
      return new Response(JSON.stringify({ success: true, sent: false, reason: 'nothing to report' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const unfinishedRows = unfinished
      .map((r: Record<string, unknown>) => {
        const w = (r.waitlist ?? {}) as Record<string, unknown>;
        const answers = (r.answers ?? null) as Record<string, unknown> | null;
        const answered = answers
          ? Object.values(answers).filter((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v))).length
          : 0;
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #ececE7;font-size:14px;color:#0f172a;">${esc(w.email ?? 'unknown')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #ececE7;font-size:13px;color:#71717a;white-space:nowrap;">${answered} answered</td>
          <td style="padding:8px 12px;border-bottom:1px solid #ececE7;font-size:13px;color:#3f3f46;">${esc(summarise(answers))}</td>
        </tr>`;
      })
      .join('');

    const failedRows = (failed ?? [])
      .map(
        (f: Record<string, unknown>) => `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #ececE7;font-size:14px;color:#0f172a;">${esc(f.email)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #ececE7;font-size:13px;color:#b91c1c;">${esc(f.confirmation_error)}</td>
        </tr>`,
      )
      .join('');

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f5f5f3;padding:32px 16px;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e6e6e1;border-radius:14px;padding:28px;">
    <h1 style="margin:0 0 4px 0;font-size:20px;color:#0f172a;">Waitlist follow-ups</h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#71717a;">${unfinished.length} unfinished questionnaire${unfinished.length === 1 ? '' : 's'}${(failed?.length ?? 0) ? ` · ${failed?.length} failed confirmation email${failed?.length === 1 ? '' : 's'}` : ''}</p>
    ${unfinishedRows ? `<h2 style="margin:0 0 8px 0;font-size:15px;color:#0f172a;">Started but not finished</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">${unfinishedRows}</table>` : ''}
    ${failedRows ? `<h2 style="margin:0 0 8px 0;font-size:15px;color:#0f172a;">Confirmation emails that failed</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${failedRows}</table>` : ''}
  </div>
</div>`;

    const { error: sendError } = await new Resend(key).emails.send({
      from: 'Curatr <noreply@curatr.pro>',
      to: [ADMIN_EMAIL],
      replyTo: ADMIN_EMAIL,
      subject: `Waitlist follow-ups: ${unfinished.length} unfinished`,
      html,
    });
    if (sendError) {
      console.error('waitlist-digest send failed:', sendError);
      return new Response(JSON.stringify({ error: 'Send failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, sent: true, unfinished: unfinished.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('waitlist-digest error:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});