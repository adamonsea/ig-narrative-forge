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

// Pull a real, recently published story so the email shows the product working.
// deno-lint-ignore no-explicit-any
export async function fetchWaitlistStoryPreview(supabase: any): Promise<WaitlistStoryPreview | null> {
  try {
    const { data, error } = await supabase.rpc('get_public_topic_feed', {
      topic_slug_param: 'eastbourne',
      p_limit: 6,
      p_offset: 0,
      p_sort_by: 'newest',
    });
    if (error || !Array.isArray(data)) return null;
    const row = (data as Record<string, unknown>[]).find(
      (r) => typeof r.story_cover_illustration_url === 'string' && r.story_cover_illustration_url,
    );
    if (!row) return null;
    const raw = String(row.story_cover_illustration_url);
    // Serve a width-capped render so the email stays light.
    const imageUrl = raw.includes('/storage/v1/object/public/')
      ? `${raw.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')}?width=1040&quality=75`
      : raw;
    return {
      title: String(row.story_title ?? ''),
      imageUrl,
      sourceName: (row.source_name as string) ?? null,
    };
  } catch (err) {
    console.warn('Story preview lookup failed:', err);
    return null;
  }
}
export const WAITLIST_REPLY_TO = 'adamonsea@gmail.com';
export const WAITLIST_SUBJECT = "You're on the Curatr waitlist";
export const WAITLIST_PREHEADER =
  "Six questions from early adopters help decide what we build next.";

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
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <style>
      .cta-primary, .cta-primary:link, .cta-primary:visited, .cta-primary span { color:#0c1522 !important; }
      .cta-secondary { background-color:#ffffff !important; color:#0c1522 !important; border:2px solid #0c1522 !important; }
      @media (prefers-color-scheme: dark) {
        .cta-primary, .cta-primary:link, .cta-primary:visited, .cta-primary span { color:#0c1522 !important; }
        .cta-secondary { background-color:transparent !important; color:#ffffff !important; border:2px solid #ffffff !important; }
      }
      [data-ogsc] .cta-primary, [data-ogsc] .cta-primary span { color:#0c1522 !important; }
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
                  Hi, Adam here — I make Curatr. You're on the list${planLine(plan)}, and I'll email you the moment your spot opens.
                </p>
                <p style="margin:0 0 24px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  Before then: I'm asking the first early adopters what they actually want, because your answers help decide what I build next. Six questions, tap to answer, no typing.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                  <tr>
                    <td bgcolor="#20D693" style="background:#20D693;background-color:#20D693;border-radius:999px;mso-padding-alt:14px 28px;">
                      <a class="cta-primary" href="${url}" style="display:inline-block;background:#20D693;background-color:#20D693;border:1px solid #20D693;border-radius:999px;color:#0c1522 !important;text-decoration:none;font-size:16px;font-weight:700;line-height:20px;padding:14px 28px;mso-padding-alt:0;"><span style="color:#0c1522 !important;-webkit-text-fill-color:#0c1522;">Early adopter Qs</span></a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 24px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  Curatr runs a live news feed on a town or a topic: it trawls the sources, rewrites the stories and illustrates them daily.${storyBlock ? " Here's one it made this week." : ''}
                </p>
${storyBlock}
                <p style="margin:0 0 28px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  Rather watch than read? <a href="https://curatr.pro/?explainer=1" style="color:#0c1522;font-weight:600;">Take the 75-second tour</a> — or browse a live feed at <a href="https://curatr.pro/feed/eastbourne" style="color:#0c1522;">curatr.pro/feed/eastbourne</a>.
                </p>
                <p style="margin:0 0 24px 0;font-size:16px;line-height:1.65;color:#3f3f46;">
                  One thing I'd love to know: what would your first feed be, a town or a topic? <a href="${url}" style="color:#0c1522;font-weight:600;">Tell me here</a>, or just hit reply.
                </p>
                <p style="margin:0;font-size:16px;line-height:1.65;color:#0c1522;">
                  Adam<br /><span style="font-size:14px;color:#71717a;">I read and answer everything myself</span>
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
    `Hi, Adam here — I make Curatr. You're on the list${plan && plan !== 'general' ? ` for the ${plan} plan` : ''}, and I'll email you the moment your spot opens.`,
    '',
    "Before then: I'm asking the first early adopters what they actually want, because your",
    'answers help decide what I build next. Six questions, tap to answer, no typing:',
    '',
    questionnaireUrl,
    '',
    'Curatr runs a live news feed on a town or a topic: it trawls the sources, rewrites the',
    'stories and illustrates them daily.',
    ...(story?.title ? ['', `A story it made recently: ${story.title}`] : []),
    '',
    'Watch the 75-second tour: https://curatr.pro/?explainer=1',
    'Or browse a live feed: https://curatr.pro/feed/eastbourne',
    '',
    'One thing I would love to know: what would your first feed be, a town or a topic?',
    '',
    'Adam',
    'I read and answer everything myself.',
    'WhatsApp: https://wa.me/447810546694',
    '',
    '---',
    'You received this because you joined the waitlist at curatr.pro.',
    'No further emails until we launch. To be removed, reply with "unsubscribe".',
  ].join('\n');