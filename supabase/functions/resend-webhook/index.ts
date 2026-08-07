// Resend delivery webhook: records bounces and spam complaints against waitlist
// entries so future sends skip dead addresses.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { Webhook } from 'https://esm.sh/svix@1.24.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, svix-id, svix-timestamp, svix-signature',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET not configured')
    return json({ error: 'Not configured' }, 500)
  }

  const payload = await req.text()
  let event: Record<string, any>
  try {
    event = new Webhook(secret).verify(payload, {
      'svix-id': req.headers.get('svix-id') ?? '',
      'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
      'svix-signature': req.headers.get('svix-signature') ?? '',
    }) as Record<string, any>
  } catch (err) {
    console.error('Invalid webhook signature:', err)
    return json({ error: 'Invalid signature' }, 401)
  }

  const type = String(event?.type ?? '')
  const data = event?.data ?? {}
  const recipients: string[] = Array.isArray(data.to) ? data.to : data.to ? [String(data.to)] : []
  const emails = recipients
    .map((e) => String(e).trim().toLowerCase())
    .filter((e) => e.includes('@'))

  if (emails.length === 0) return json({ success: true, ignored: 'no recipient' })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { last_email_event: type, last_email_event_at: now }

  if (type === 'email.bounced') {
    const bounce = data.bounce ?? {}
    patch.bounced_at = now
    patch.bounce_type = String(bounce.type ?? bounce.subType ?? 'unknown')
    patch.bounce_reason = String(bounce.message ?? data.reason ?? '').slice(0, 500)
  } else if (type === 'email.complained') {
    patch.complained_at = now
  } else if (type !== 'email.delivered' && type !== 'email.opened' && type !== 'email.clicked') {
    return json({ success: true, ignored: type })
  }

  const { error } = await supabase.from('waitlist').update(patch).in('email', emails)
  if (error) {
    console.error('Waitlist email-event update failed:', error)
    return json({ error: 'Update failed' }, 500)
  }

  return json({ success: true, type, recipients: emails.length })
})