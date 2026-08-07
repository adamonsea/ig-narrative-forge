// Single follow-up nudge for waitlist signups who never opened the questionnaire.
// Deliberately short: it should read like a person chasing, not a campaign.

export const FOLLOWUP_SUBJECT = 'Re: You\u2019re on the Curatr waitlist';
export const FOLLOWUP_PREHEADER = 'Seven questions, tap to answer \u2014 or tell me it\u2019s not for you.';

export interface FollowupEmailInput {
  questionnaireUrl: string;
}

const esc = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const buildFollowupEmailHtml = ({ questionnaireUrl }: FollowupEmailInput) => {
  const url = esc(questionnaireUrl);
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <style>
      .cta-primary, .cta-primary:link, .cta-primary:visited, .cta-primary span { color:#0c1522 !important; }
      @media (prefers-color-scheme: dark) {
        .cta-primary, .cta-primary:link, .cta-primary:visited, .cta-primary span { color:#0c1522 !important; }
      }
      [data-ogsc] .cta-primary, [data-ogsc] .cta-primary span { color:#0c1522 !important; }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${esc(FOLLOWUP_PREHEADER)}</div>
    <div style="display:none;max-height:0;overflow:hidden;">&#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;">
            <tr>
              <td style="padding:8px 0 24px 0;">
                <div style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;letter-spacing:-0.5px;color:#0c1522;">Curatr<span style="color:#20D693;">.</span><span style="font-size:18px;opacity:0.6;">pro</span></div>
              </td>
            </tr>
            <tr>
              <td style="padding:0;">
                <p style="margin:0 0 22px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  Hi again \u2014 Adam from Curatr. I sent you the early adopter questions a few days ago and didn\u2019t want them to get buried.
                </p>
                <p style="margin:0 0 26px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  Seven questions, tap to answer, no typing. What the first people say genuinely decides what I build before launch.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                  <tr>
                    <td bgcolor="#20D693" style="background:#20D693;background-color:#20D693;border-radius:999px;mso-padding-alt:14px 28px;">
                      <a class="cta-primary" href="${url}" style="display:inline-block;background:#20D693;background-color:#20D693;border:1px solid #20D693;border-radius:999px;color:#0c1522 !important;text-decoration:none;font-size:16px;font-weight:700;line-height:20px;padding:14px 28px;mso-padding-alt:0;"><span style="color:#0c1522 !important;-webkit-text-fill-color:#0c1522;">Early adopter Qs</span></a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 24px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  And if it\u2019s not for you, just reply \u201Cno thanks\u201D and I won\u2019t chase again \u2014 you\u2019ll still get your invite when we open up.
                </p>
                <p style="margin:0;font-size:16px;line-height:1.65;color:#0c1522;">
                  Adam<br /><span style="font-size:14px;color:#71717a;">I read and answer everything myself</span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 0 0 0;">
                <hr style="border:none;border-top:1px solid #ececE7;margin:0 0 16px 0;" />
                <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">
                  You received this because you joined the waitlist at curatr.pro. This is the last reminder \u2014 the next email from me will be your invite. To be removed, reply with \u201Cunsubscribe\u201D.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export const buildFollowupEmailText = ({ questionnaireUrl }: FollowupEmailInput) =>
  [
    'Hi again — Adam from Curatr. I sent you the early adopter questions a few days ago',
    "and didn't want them to get buried.",
    '',
    'Seven questions, tap to answer, no typing. What the first people say genuinely decides',
    'what I build before launch:',
    '',
    questionnaireUrl,
    '',
    'And if it is not for you, just reply "no thanks" and I will not chase again — you will',
    'still get your invite when we open up.',
    '',
    'Adam',
    'I read and answer everything myself.',
    '',
    '---',
    'You received this because you joined the waitlist at curatr.pro.',
    'This is the last reminder — the next email from me will be your invite.',
    'To be removed, reply with "unsubscribe".',
  ].join('\n');