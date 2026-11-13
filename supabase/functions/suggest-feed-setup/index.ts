// One-sentence feed setup: "What's your feed about?" → a complete suggested feed.
// Signed-in owners only. Returns name, type/region, keywords (more of this),
// exclusions (less of this), colour, picture style, welcome line and the
// suggested Family-safe / brand-safe choices. Sources are suggested separately
// by suggest-content-sources so the two can run side by side.
import { getUser } from '../_shared/auth.ts';
import { llmFetch } from '../_shared/llm-router.ts';
import { fallbackSetup, normaliseSetup } from './rules.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const extractJson = (text: string) => {
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  return start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
};

const SYSTEM = `You set up curated news feeds from one short description. Return STRICT JSON only:
{"name":"publication-style feed name, 1-4 words, keep the subject's own spelling (e.g. 'Pokémon Pulse', 'Eastbourne Today', 'Brighton Jazz Notes')",
 "topic_type":"regional if the feed is about a town, city or area's news; otherwise keyword",
 "region":"the town/city/area for regional feeds, else null",
 "description":"one plain sentence on what the feed covers",
 "keywords":["12-18 lowercase terms a news filter should look for: names, sub-topics, events, products, people. For regional feeds include nearby districts and local institutions"],
 "negative_keywords":["3-8 lowercase terms that cause predictable false matches (homonyms, unrelated namesakes, spam)"],
 "colour":"#RRGGBB brand colour suited to the subject, mid-tone, not near white or black",
 "illustration_style":"editorial_illustrative | editorial_photographic | illustrated_icon",
 "welcome":"one sentence welcoming readers, under 90 characters, adult newsroom tone, no exclamation marks",
 "brand_or_fandom": true if the subject is a brand, franchise, game, film/TV property, character, band or fandom, else false,
 "family_safe": true for hobby, fandom, games, children's and family subjects; false for news, local news, politics, business, crime or general current affairs}
Never invent facts about places. Plain English, no hype.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const user = await getUser(req);
  if (!user) return json({ error: 'Please sign in to set up a feed.' }, 401);

  let about = '';
  try {
    const body = await req.json();
    about = typeof body?.about === 'string' ? body.about.replace(/\s+/g, ' ').trim() : '';
  } catch {
    /* handled below */
  }
  if (about.length < 2 || about.length > 120) {
    return json({ error: 'Tell us in a few words what the feed is about.' }, 400);
  }

  try {
    const res = await llmFetch(
      {
        body: {
          model: 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: `The feed is about: ${about}` },
          ],
          temperature: 0.4,
          max_tokens: 1200,
          response_format: { type: 'json_object' },
        },
      },
      { context: 'suggest-feed-setup' },
    );
    if (!res.ok) {
      console.error('suggest-feed-setup model error', res.status, (await res.text()).slice(0, 300));
      return json({ setup: fallbackSetup(about), fallback: true });
    }
    const payload = await res.json();
    const raw = payload?.choices?.[0]?.message?.content ?? '';
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      console.error('suggest-feed-setup parse failure', raw.slice(0, 200));
    }
    return json({ setup: normaliseSetup(parsed, about), fallback: parsed === null });
  } catch (error) {
    console.error('suggest-feed-setup failed', error);
    return json({ setup: fallbackSetup(about), fallback: true });
  }
});
