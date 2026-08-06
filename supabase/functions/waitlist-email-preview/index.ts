// Admin-only helper: sends the waitlist confirmation email to the product owner for QA.
import { Resend } from 'npm:resend@4.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OWNER_EMAIL = 'adamonsea@gmail.com'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const waitlistEmailHtml = (plan: string, questionnaireUrl: string) => `
<!DOCTYPE html>
<html>
  <head>
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <style>
      .cta-primary { background-color:#0c1522 !important; color:#ffffff !important; border:2px solid #0c1522 !important; }
      .cta-secondary { background-color:#ffffff !important; color:#0c1522 !important; border:2px solid #0c1522 !important; }
      @media (prefers-color-scheme: dark) {
        .cta-primary { background-color:#20D693 !important; color:#0c1522 !important; border:2px solid #20D693 !important; }
        .cta-secondary { background-color:transparent !important; color:#ffffff !important; border:2px solid #ffffff !important; }
      }
      [data-ogsc] .cta-primary { background-color:#20D693 !important; color:#0c1522 !important; border:2px solid #20D693 !important; }
      [data-ogsc] .cta-secondary { background-color:transparent !important; color:#ffffff !important; border:2px solid #ffffff !important; }
    </style>
  </head>
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
                <a class="cta-primary" href="${escapeHtml(questionnaireUrl)}" style="display:inline-block;background-color:#0c1522;color:#ffffff;border:2px solid #0c1522;text-decoration:none;font-size:15px;font-weight:500;padding:14px 26px;border-radius:999px;">Answer a few questions</a>
                <p style="margin:28px 0 24px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  Curatr runs a live news feed on a subject or place: it trawls the sources, rewrites the stories and illustrates them daily.
                </p>
                <p style="margin:0 0 28px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  If you'd rather just see it working, here's a live feed: <a href="https://curatr.pro/feed/eastbourne" style="color:#0c1522;">curatr.pro/feed/eastbourne</a>
                </p>
                <p style="margin:0;font-size:16px;line-height:1.65;color:#0c1522;">
                  Adam<br /><span style="font-size:14px;color:#71717a;">Curatr maker</span>
                </p>
                <p style="margin:20px 0 0 0;">
                  <a class="cta-secondary" href="https://wa.me/447810546694" style="display:inline-block;background-color:#ffffff;color:#0c1522;text-decoration:none;font-size:15px;font-weight:500;padding:13px 25px;border-radius:999px;border:2px solid #0c1522;">WhatsApp Adam</a>
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const token = typeof body.token === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(body.token)
      ? body.token
      : 'preview'

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Email not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resend = new Resend(resendApiKey)
    const questionnaireUrl = `https://curatr.pro/waitlist/welcome?token=${encodeURIComponent(token)}`
    const { error } = await resend.emails.send({
      from: 'Curatr <noreply@curatr.pro>',
      to: [OWNER_EMAIL],
      subject: "[Preview] You're on the Curatr waitlist",
      html: waitlistEmailHtml('general', questionnaireUrl),
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
