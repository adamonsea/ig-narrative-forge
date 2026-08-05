import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { Resend } from 'npm:resend@4.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const waitlistEmailHtml = (plan: string) => `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f5f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f3;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:14px;border:1px solid #e6e6e1;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <div style="font-size:24px;font-weight:600;letter-spacing:-0.5px;color:#0f172a;">Curatr<span style="font-weight:300;opacity:0.6;">.pro</span></div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <h1 style="margin:0 0 16px 0;font-size:26px;line-height:1.25;font-weight:600;color:#0f172a;">You're on the list</h1>
                <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#3f3f46;">
                  Thanks for joining the Curatr waitlist${plan && plan !== 'general' ? ` for the <strong>${escapeHtml(plan)}</strong> plan` : ''}. We're building a simple way to run your own curated news feed — choose your sources, approve what matters, publish to your audience.
                </p>
                <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#3f3f46;">
                  We'll email you as soon as your invite is ready. In the meantime, have a look at a live feed to see what Curatr produces.
                </p>
                <a href="https://curatr.pro/discover" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:13px 24px;border-radius:999px;">Explore live feeds</a>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
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

async function sendWaitlistEmail(email: string, plan: string) {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY not configured - skipping waitlist confirmation email')
    return
  }
  try {
    const resend = new Resend(resendApiKey)
    const { error } = await resend.emails.send({
      from: 'Curatr <noreply@curatr.pro>',
      to: [email],
      subject: "You're on the Curatr waitlist",
      html: waitlistEmailHtml(plan),
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
      .select()

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

    await sendWaitlistEmail(email, plan || 'general')

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