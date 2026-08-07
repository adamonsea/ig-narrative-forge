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

const ADMIN_EMAIL = 'adamonsea@gmail.com'

const escapeHtml = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function notifyAdminOfSignup(email: string, plan: string, alreadyRegistered: boolean) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY not configured - skipping admin signup notification')
    return
  }
  try {
    const when = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })
    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f5f5f3;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e6e1;border-radius:14px;padding:28px;">
    <h1 style="margin:0 0 16px 0;font-size:20px;color:#0f172a;">New waitlist signup${alreadyRegistered ? ' (repeat)' : ''}</h1>
    <p style="margin:0 0 8px 0;font-size:15px;color:#0f172a;"><strong>${escapeHtml(email)}</strong></p>
    <p style="margin:0 0 4px 0;font-size:14px;color:#71717a;">Plan: ${escapeHtml(plan)}</p>
    <p style="margin:0;font-size:14px;color:#71717a;">${escapeHtml(when)} (UK)</p>
  </div>
</div>`

    const { error } = await new Resend(resendApiKey).emails.send({
      from: 'Curatr <noreply@curatr.pro>',
      to: [ADMIN_EMAIL],
      replyTo: email,
      subject: `New waitlist signup: ${email}`,
      html,
      text: `New waitlist signup${alreadyRegistered ? ' (repeat)' : ''}: ${email}\nPlan: ${plan}\n${when} (UK)`,
    })
    if (error) console.error('Admin signup notification error:', error)
  } catch (err) {
    console.error('Admin signup notification failed:', err)
  }
}

async function sendWaitlistEmail(
  supabase: ReturnType<typeof createClient>,
  waitlistId: string | null,
  email: string,
  plan: string,
  inviteToken: string,
) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY not configured - skipping waitlist confirmation email')
    return
  }

  const recordStatus = async (patch: Record<string, unknown>) => {
    if (!waitlistId) return
    await supabase.from('waitlist').update(patch).eq('id', waitlistId)
  }

  try {
    const resend = new Resend(resendApiKey)
    const questionnaireUrl = `https://curatr.pro/waitlist/welcome?token=${encodeURIComponent(inviteToken)}`
    const story = await fetchWaitlistStoryPreview(supabase)
    const payload = { plan, questionnaireUrl, story }

    const { error } = await resend.emails.send({
      from: WAITLIST_FROM,
      to: [email],
      replyTo: WAITLIST_REPLY_TO,
      subject: WAITLIST_SUBJECT,
      html: buildWaitlistEmailHtml(payload),
      text: buildWaitlistEmailText(payload),
      headers: WAITLIST_HEADERS,
    })

    if (error) {
      console.error('Waitlist confirmation email error:', error)
      await recordStatus({ confirmation_error: String(error.message ?? error) })
      return
    }
    await recordStatus({ confirmation_sent_at: new Date().toISOString(), confirmation_error: null })
  } catch (err) {
    console.error('Waitlist confirmation email failed:', err)
    await recordStatus({ confirmation_error: err instanceof Error ? err.message : String(err) })
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { email, plan } = await req.json()

    console.log('Waitlist signup attempt:', { email, plan })

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Insert into waitlist
    const { data, error } = await supabase
      .from('waitlist')
      .insert({ email, plan: plan || 'general' })
      .select('id, email, invite_token')

    if (error) {
      console.error('Waitlist signup error:', error)
      
      // Duplicate signup: re-send the same confirmation rather than going silent.
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('waitlist')
          .select('id, plan, invite_token')
          .eq('email', email)
          .maybeSingle()

        if (existing?.invite_token) {
          await sendWaitlistEmail(
            supabase,
            existing.id,
            email,
            existing.plan || 'general',
            existing.invite_token,
          )
        }

        await notifyAdminOfSignup(email, existing?.plan || plan || 'general', true)

        return new Response(
          JSON.stringify({
            success: true,
            already_registered: true,
            message: "You're already on the list — we've re-sent your confirmation email.",
          }),
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      return new Response(
        JSON.stringify({ error: 'Failed to join waitlist' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Waitlist signup successful:', data)

    await sendWaitlistEmail(
      supabase,
      data?.[0]?.id ?? null,
      email,
      plan || 'general',
      data?.[0]?.invite_token ?? '',
    )

    await notifyAdminOfSignup(email, plan || 'general', false)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Successfully joined waitlist' 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

    } catch (error) {
      console.error('Unexpected error:', error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
})