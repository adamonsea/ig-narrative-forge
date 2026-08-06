// Shared builder for the waitlist confirmation email so the live send and the
// admin preview never drift apart.

export interface WaitlistStoryPreview {
  title: string;
  imageUrl: string;
  sourceName?: string | null;
}

export interface WaitlistEmailInput {
  plan?: string | null;
  questionnaireUrl: string;
  story?: WaitlistStoryPreview | null;
}

export const WAITLIST_FROM = 'Curatr <noreply@curatr.pro>';
export const WAITLIST_REPLY_TO = 'adamonsea@gmail.com';
export const WAITLIST_SUBJECT = "You're on the Curatr waitlist";
export const WAITLIST_PREHEADER =
  "A few questions so we build the feed you'd actually use — takes about a minute.";

// mailto unsubscribe: honest for a pre-launch list of this size, and satisfies
// bulk-sender expectations without a public one-click endpoint.
export const WAITLIST_HEADERS: Record<string, string> = {
  'List-Unsubscribe': `<mailto:${WAITLIST_REPLY_TO}?subject=unsubscribe>`,
};

const esc = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const planLine = (plan?: string | null) =>
  plan && plan !== 'general' ? ` for the <strong>${esc(plan)}</strong> plan` : '';

export const buildWaitlistEmailHtml = ({ plan, questionnaireUrl, story }: WaitlistEmailInput) => {
  const url = esc(questionnaireUrl);
  const storyBlock = story?.imageUrl
    ? `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;border:1px solid #ececE7;border-radius:14px;overflow:hidden;">
                  <tr>
                    <td style="padding:0;">
                      <img src="${esc(story.imageUrl)}" width="520" alt="${esc(story.title)}" style="display:block;width:100%;max-width:520px;height:auto;border:0;" />
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0;font-size:15px;line-height:1.45;font-weight:600;color:#0c1522;">${esc(story.title)}</p>
                      <p style="margin:6px 0 0 0;font-size:13px;color:#71717a;">From a live Curatr feed${story.sourceName ? ` · source: ${esc(story.sourceName)}` : ''}</p>
                    </td>
                  </tr>
                </table>`
    : '';

  return `
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
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${esc(WAITLIST_PREHEADER)}</div>
    <div style="display:none;max-height:0;overflow:hidden;">&#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;</div>
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
                  Hi, Adam here — I make Curatr. Thanks for joining the waitlist${planLine(plan)}. I'm speaking to everyone on the list before we open up, to make sure Curatr offers what people actually want. Could you answer a few questions? It takes about a minute.
                </p>
                <a class="cta-primary" href="${url}" style="display:inline-block;background-color:#0c1522;color:#ffffff;border:2px solid #0c1522;text-decoration:none;font-size:15px;font-weight:500;padding:14px 26px;border-radius:999px;">Answer a few questions</a>
                <p style="margin:28px 0 24px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  Curatr runs a live news feed on a subject or place: it trawls the sources, rewrites the stories and illustrates them daily.
                </p>
${storyBlock}
                <p style="margin:0 0 28px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  Rather watch than read? <a href="https://curatr.pro/?explainer=1" style="color:#0c1522;font-weight:600;">Take the 75-second tour</a> — or browse a live feed at <a href="https://curatr.pro/feed/eastbourne" style="color:#0c1522;">curatr.pro/feed/eastbourne</a>.
                </p>
                <p style="margin:0 0 24px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  If you only do one thing, <a href="${url}" style="color:#0c1522;font-weight:600;">answer the questions</a> — it genuinely shapes what I build next.
                </p>
                <p style="margin:0;font-size:16px;line-height:1.65;color:#0c1522;">
                  Adam<br /><span style="font-size:14px;color:#71717a;">Just hit reply, I read everything</span>
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
                  You received this because you joined the waitlist at curatr.pro. No further emails until we launch. To be removed, reply with "unsubscribe".
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

export const buildWaitlistEmailText = ({ plan, questionnaireUrl, story }: WaitlistEmailInput) =>
  [
    "You're on the list",
    '',
    `Hi — thanks for signing up to Curatr${plan && plan !== 'general' ? ` for the ${plan} plan` : ''}.`,
    "We're speaking to everyone on the waitlist before we open up, to make sure it offers what",
    'people want. Please help us by answering a few questions — it takes about a minute:',
    '',
    questionnaireUrl,
    '',
    'Curatr runs a live news feed on a subject or place: it trawls the sources, rewrites the',
    'stories and illustrates them daily.',
    ...(story?.title ? ['', `A story it made recently: ${story.title}`] : []),
    '',
    'Watch the 75-second tour: https://curatr.pro/?explainer=1',
    'Or browse a live feed: https://curatr.pro/feed/eastbourne',
    '',
    'Adam',
    'Curatr maker — just hit reply, I read everything.',
    'WhatsApp: https://wa.me/447810546694',
    '',
    '---',
    'You received this because you joined the waitlist at curatr.pro.',
    'No further emails until we launch. To be removed, reply with "unsubscribe".',
  ].join('\n');