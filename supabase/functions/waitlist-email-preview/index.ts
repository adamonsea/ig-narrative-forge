// Admin-only helper: sends the waitlist confirmation email to the product owner for QA.
import { Resend } from 'npm:resend@4.0.0'
import {
  buildWaitlistEmailHtml,
  buildWaitlistEmailText,
  WAITLIST_FROM,
  WAITLIST_HEADERS,
  WAITLIST_REPLY_TO,
} from '../_shared/waitlist-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OWNER_EMAIL = 'adamonsea@gmail.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const rawToken = typeof body.token === 'string' && /^[a-zA-Z0-9_-]{4,120}$/.test(body.token)
      ? body.token
      : `${Date.now()}`
    // Preview links must carry the `preview-` prefix or the questionnaire treats them as expired.
    const token = rawToken.startsWith('preview-') ? rawToken : `preview-${rawToken}`

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Email not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resend = new Resend(resendApiKey)
    const questionnaireUrl = `https://curatr.pro/waitlist/welcome?token=${encodeURIComponent(token)}`
    const payload = { plan: 'general', questionnaireUrl, story: null }
    const { error } = await resend.emails.send({
      from: WAITLIST_FROM,
      to: [OWNER_EMAIL],
      replyTo: WAITLIST_REPLY_TO,
      subject: "[Preview] You're on the Curatr waitlist",
      html: buildWaitlistEmailHtml(payload),
      text: buildWaitlistEmailText(payload),
      headers: WAITLIST_HEADERS,
    })

    if (error) {
      console.error('Preview email error:', error)
      return new Response(JSON.stringify({ error: 'Send failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, sent_to: OWNER_EMAIL, questionnaireUrl }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('Unexpected error:', e)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
