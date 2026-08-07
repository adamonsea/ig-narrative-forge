// Owner-only backfill: send the waitlist confirmation email to specific waitlist
// entries that predate the automatic send. Preview mode mails the owner instead.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { Resend } from 'npm:resend@4.0.0'
import {
  buildWaitlistEmailHtml,
  buildWaitlistEmailText,
  fetchWaitlistStoryPreview,
  WAITLIST_FROM,
  WAITLIST_HEADERS,
  WAITLIST_REPLY_TO,
  WAITLIST_SUBJECT,
} from '../_shared/waitlist-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OWNER_EMAIL = 'adamonsea@gmail.com'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(
      authHeader.replace('Bearer ', ''),
    )
    const callerEmail = String(claimsData?.claims?.email ?? '').toLowerCase()
    if (claimsError || callerEmail !== OWNER_EMAIL) return json({ error: 'Forbidden' }, 403)

    const body = await req.json().catch(() => ({}))
    const mode = body.mode === 'send' ? 'send' : 'preview'
    const force = body.force === true
    const emails: string[] = Array.isArray(body.emails)
      ? body.emails.filter((e: unknown) => typeof e === 'string' && e.includes('@')).map((e: string) => e.trim().toLowerCase())
      : []
    if (emails.length === 0) return json({ error: 'No recipients supplied' }, 400)

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) return json({ error: 'Email not configured' }, 500)
    const resend = new Resend(resendApiKey)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: rows, error: rowsError } = await supabase
      .from('waitlist')
      .select('id, email, plan, invite_token, confirmation_sent_at')
      .in('email', emails)

    if (rowsError) {
      console.error('Waitlist lookup failed:', rowsError)
      return json({ error: 'Lookup failed' }, 500)
    }

    const story = await fetchWaitlistStoryPreview(supabase)
    const results: Record<string, unknown>[] = []

    for (const email of emails) {
      const row = (rows ?? []).find((r) => String(r.email).toLowerCase() === email)
      if (!row) {
        results.push({ email, status: 'skipped', reason: 'not on waitlist' })
        continue
      }
      if (!row.invite_token) {
        results.push({ email, status: 'skipped', reason: 'no invite token' })
        continue
      }
      if (mode === 'send' && row.confirmation_sent_at && !force) {
        results.push({ email, status: 'skipped', reason: 'already sent' })
        continue
      }

      const questionnaireUrl = `https://curatr.pro/waitlist/welcome?token=${encodeURIComponent(row.invite_token)}`
      const payload = { plan: row.plan || 'general', questionnaireUrl, story }

      const { error: sendError } = await resend.emails.send({
        from: WAITLIST_FROM,
        to: [mode === 'send' ? row.email : OWNER_EMAIL],
        replyTo: WAITLIST_REPLY_TO,
        subject: mode === 'send' ? WAITLIST_SUBJECT : `[Preview → ${row.email}] ${WAITLIST_SUBJECT}`,
        html: buildWaitlistEmailHtml(payload),
        text: buildWaitlistEmailText(payload),
        headers: WAITLIST_HEADERS,
      })

      if (sendError) {
        console.error('Waitlist send error:', row.email, sendError)
        if (mode === 'send') {
          await supabase
            .from('waitlist')
            .update({ confirmation_error: String(sendError.message ?? sendError) })
            .eq('id', row.id)
        }
        results.push({ email, status: 'failed', error: String(sendError.message ?? sendError) })
        continue
      }

      if (mode === 'send') {
        await supabase
          .from('waitlist')
          .update({ confirmation_sent_at: new Date().toISOString(), confirmation_error: null })
          .eq('id', row.id)
      }

      results.push({ email, status: 'sent', to: mode === 'send' ? row.email : OWNER_EMAIL })
    }

    return json({ success: true, mode, results })
  } catch (e) {
    console.error('Unexpected error:', e)
    return json({ error: 'Internal server error' }, 500)
  }
})