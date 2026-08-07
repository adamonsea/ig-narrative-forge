// One-shot follow-up nudge for waitlist signups who never answered the questionnaire.
// Runs daily via cron (service-role caller) or manually by the owner.
// Modes: 'dry' (list who would get it), 'preview' (mail the owner), 'send' (mail them).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { Resend } from 'npm:resend@4.0.0'
import {
  buildFollowupEmailHtml,
  buildFollowupEmailText,
  FOLLOWUP_SUBJECT,
} from '../_shared/waitlist-followup-email.ts'
import { WAITLIST_FROM, WAITLIST_HEADERS, WAITLIST_REPLY_TO } from '../_shared/waitlist-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OWNER_EMAIL = 'adamonsea@gmail.com'
const DEFAULT_DELAY_DAYS = 4

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const mode: 'dry' | 'preview' | 'send' =
      body.mode === 'send' ? 'send' : body.mode === 'preview' ? 'preview' : 'dry'

    // 'preview' only ever mails the product owner, so it needs no caller auth.
    // Anything that reads or mails real signups does.
    if (mode !== 'preview') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
      const bearer = authHeader.replace('Bearer ', '').trim()
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const adminToken = Deno.env.get('WAITLIST_ADMIN_TOKEN') ?? ''
      const cronToken = Deno.env.get('WAITLIST_FOLLOWUP_CRON_TOKEN') ?? ''
      const opsToken = Deno.env.get('WAITLIST_OPS_TOKEN') ?? ''
      const isServiceCaller =
        (serviceKey.length > 0 && bearer === serviceKey) ||
        (adminToken.length > 0 && bearer === adminToken) ||
        (cronToken.length > 0 && bearer === cronToken) ||
        (opsToken.length > 0 && bearer === opsToken)

      if (!isServiceCaller) {
        const authClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: authHeader } } },
        )
        const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(bearer)
        const callerEmail = String(claimsData?.claims?.email ?? '').toLowerCase()
        if (claimsError || callerEmail !== OWNER_EMAIL) return json({ error: 'Forbidden' }, 403)
      }
    }

    const delayDays = Number.isFinite(body.delay_days)
      ? Math.max(0, Math.min(60, Number(body.delay_days)))
      : DEFAULT_DELAY_DAYS

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Owner-triggered sample email: never touches real signups.
    if (mode === 'preview') {
      const resendApiKey = Deno.env.get('RESEND_API_KEY')
      if (!resendApiKey) return json({ error: 'Email not configured' }, 500)
      const resend = new Resend(resendApiKey)
      // Preview tokens must carry the `preview-` prefix or the questionnaire rejects them.
      const questionnaireUrl = `https://curatr.pro/waitlist/welcome?token=preview-${Date.now()}`
      const { error } = await resend.emails.send({
        from: WAITLIST_FROM,
        to: [OWNER_EMAIL],
        replyTo: WAITLIST_REPLY_TO,
        subject: `[Preview] ${FOLLOWUP_SUBJECT}`,
        html: buildFollowupEmailHtml({ questionnaireUrl }),
        text: buildFollowupEmailText({ questionnaireUrl }),
        headers: WAITLIST_HEADERS,
      })
      if (error) {
        console.error('Follow-up preview error:', error)
        return json({ error: 'Send failed' }, 502)
      }
      return json({ success: true, mode, sent_to: OWNER_EMAIL, questionnaireUrl })
    }

    const cutoff = new Date(Date.now() - delayDays * 24 * 60 * 60 * 1000).toISOString()

    const { data: rows, error: rowsError } = await supabase
      .from('waitlist')
      .select('id, email, invite_token, confirmation_sent_at')
      .not('confirmation_sent_at', 'is', null)
      .lte('confirmation_sent_at', cutoff)
      .is('follow_up_sent_at', null)
      .eq('follow_up_opted_out', false)
      .is('bounced_at', null)
      .is('complained_at', null)
      .not('invite_token', 'is', null)
      .limit(200)

    if (rowsError) {
      console.error('Follow-up lookup failed:', rowsError)
      return json({ error: 'Lookup failed' }, 500)
    }

    const candidates = rows ?? []
    if (candidates.length === 0) return json({ success: true, mode, eligible: 0, results: [] })

    // Never chase someone who already answered.
    const { data: responded, error: respError } = await supabase
      .from('waitlist_responses')
      .select('waitlist_id')
      .in('waitlist_id', candidates.map((r) => r.id))

    if (respError) {
      console.error('Response lookup failed:', respError)
      return json({ error: 'Lookup failed' }, 500)
    }
    const answered = new Set((responded ?? []).map((r) => String(r.waitlist_id)))
    const eligible = candidates.filter((r) => !answered.has(String(r.id)))

    if (mode === 'dry') {
      return json({
        success: true,
        mode,
        delay_days: delayDays,
        eligible: eligible.length,
        results: eligible.map((r) => ({ email: r.email, waiting_since: r.confirmation_sent_at })),
      })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) return json({ error: 'Email not configured' }, 500)
    const resend = new Resend(resendApiKey)
    const results: Record<string, unknown>[] = []

    for (const row of eligible) {
      const questionnaireUrl = `https://curatr.pro/waitlist/welcome?token=${encodeURIComponent(String(row.invite_token))}`
      const { error: sendError } = await resend.emails.send({
        from: WAITLIST_FROM,
        to: [row.email],
        replyTo: WAITLIST_REPLY_TO,
        subject: FOLLOWUP_SUBJECT,
        html: buildFollowupEmailHtml({ questionnaireUrl }),
        text: buildFollowupEmailText({ questionnaireUrl }),
        headers: WAITLIST_HEADERS,
      })

      if (sendError) {
        console.error('Follow-up send error:', row.email, sendError)
        await supabase
          .from('waitlist')
          .update({ follow_up_error: String(sendError.message ?? sendError) })
          .eq('id', row.id)
        results.push({ email: row.email, status: 'failed', error: String(sendError.message ?? sendError) })
        continue
      }

      await supabase
        .from('waitlist')
        .update({ follow_up_sent_at: new Date().toISOString(), follow_up_error: null })
        .eq('id', row.id)
      results.push({ email: row.email, status: 'sent' })
    }

    return json({ success: true, mode, delay_days: delayDays, eligible: eligible.length, results })
  } catch (e) {
    console.error('Unexpected error:', e)
    return json({ error: 'Internal server error' }, 500)
  }
})