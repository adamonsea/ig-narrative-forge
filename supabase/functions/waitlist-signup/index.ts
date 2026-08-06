import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { Resend } from 'npm:resend@4.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const waitlistEmailHtml = (plan: string, questionnaireUrl: string) => `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;">
            <tr>
              <td style="padding:8px 0 24px 0;">
                <div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:30px;font-weight:600;letter-spacing:-0.5px;color:#0c1522;">Curatr<span style="color:#20D693;">.</span><span style="font-size:20px;opacity:0.6;">pro</span></div>
              </td>
            </tr>
            <tr>
              <td style="padding:0;">
                <h1 style="margin:0 0 20px 0;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;font-weight:600;color:#0c1522;">You're on the list</h1>
                <p style="margin:0 0 24px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  Hi — thanks for signing up to Curatr${plan && plan !== 'general' ? ` for the <strong>${escapeHtml(plan)}</strong> plan` : ''}. We're speaking to everyone on the waitlist before we open up, to make sure it offers what people want. Please help us by answering a few questions.
                </p>
                <a href="${escapeHtml(questionnaireUrl)}" style="display:inline-block;background-color:#0c1522;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:14px 26px;border-radius:999px;">Answer a few questions</a>
                <a href="https://wa.me/447810546694" style="display:inline-block;margin-left:10px;background-color:#ffffff;color:#0c1522;text-decoration:none;font-size:15px;font-weight:500;padding:13px 25px;border-radius:999px;border:1px solid #d4d4d0;">Chat to Adam</a>
                <p style="margin:28px 0 24px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  Curatr runs a live news feed on a subject or place: it trawls the sources, rewrites the stories and illustrates them daily.
                </p>
                <p style="margin:0 0 28px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  If you'd rather just see it working, here's a live feed: <a href="https://curatr.pro/feed/eastbourne" style="color:#0c1522;">curatr.pro/feed/eastbourne</a>
                </p>
                <p style="margin:0;font-size:16px;line-height:1.65;color:#0c1522;">
                  Adam<br /><span style="font-size:14px;color:#71717a;">Curatr maker</span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 0 0 0;">
                <hr style="border:none;border-top:1px solid #ececE7;margin:0 0 16px 0;" />
                <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">
                  You received this because you joined the waitlist at curatr.pro. No further emails until we launch.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

async function sendWaitlistEmail(email: string, plan: string, inviteToken: string) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY not configured - skipping waitlist confirmation email')
    return
  }
  try {
    const resend = new Resend(resendApiKey)
    const questionnaireUrl = `https://curatr.pro/waitlist/welcome?token=${encodeURIComponent(inviteToken)}`
    const { error } = await resend.emails.send({
      from: 'Curatr <noreply@curatr.pro>',
      to: [email],
      subject: "You're on the Curatr waitlist",
      html: waitlistEmailHtml(plan, questionnaireUrl),
    })
    if (error) console.error('Waitlist confirmation email error:', error)
  } catch (err) {
    console.error('Waitlist confirmation email failed:', err)
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
      
      // Handle duplicate email error
      if (error.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'Email already registered for waitlist' }),
          { 
            status: 409, 
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

    await sendWaitlistEmail(email, plan || 'general', data?.[0]?.invite_token ?? '')

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