// Public homepage tool: turn a website address or a niche into three feed blueprints.
// No auth required. Also records the lead once an email is known.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { llmFetch } from '../_shared/llm-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const stripFences = (text: string) =>
  text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

const service = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

const looksLikeDomain = (value: string) =>
  /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i.test(value.trim());

async function fetchSiteContext(input: string): Promise<string> {
  const url = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CuratrBot/1.0)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return '';
    const html = (await res.text()).slice(0, 120_000);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
    const desc =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      '';
    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
      .slice(0, 3)
      .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    return [title.trim(), desc.trim(), ...h1s].filter(Boolean).join(' | ').slice(0, 800);
  } catch {
    return '';
  }
}

const SYSTEM = `You help businesses and individuals imagine news feeds they could curate and publish.
Return STRICT JSON only, no prose, no code fences, in this shape:
{"summary":"one short sentence describing who they are",
 "blueprints":[
   {"audience_type":"For your customers","feed_title":"...","purpose":"one plain sentence",
    "sample_story_hooks":["...","...","..."],
    "keywords":["6-10 short search terms"],
    "suggested_sources":["publication or site names likely to cover this"]}
 ]}
Rules:
- Exactly 3 blueprints, in this order of audience_type: "For your customers", "For your team", "For your partners & community".
- feed_title must be a real publication-style name (2-4 words), never generic like "Industry News".
- purpose is under 18 words, plain English, no marketing jargon.
- sample_story_hooks are believable headlines, not descriptions.
- keywords are lowercase search terms someone would actually monitor.
- suggested_sources are 3-5 plausible real publications or site types for the niche.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? 'generate');
    const db = service();

    if (action === 'capture') {
      const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 254) : '';
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json({ error: 'A valid email is required' }, 400);
      }
      await db.from('feed_leads').insert({
        email,
        input_value: String(body?.input ?? '').slice(0, 300) || 'unknown',
        input_type: looksLikeDomain(String(body?.input ?? '')) ? 'domain' : 'topic',
        blueprint: body?.blueprint ?? null,
        user_id: typeof body?.userId === 'string' && body.userId ? body.userId : null,
      });
      return json({ success: true });
    }

    const input = String(body?.input ?? '').trim();
    if (input.length < 2 || input.length > 200) {
      return json({ error: 'Tell us a website address or a subject (2-200 characters).' }, 400);
    }

    // Light IP rate limit: 12 generations per hour.
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from('feed_leads')
      .select('id', { count: 'exact', head: true })
      .eq('input_type', `rl:${ip}`)
      .gte('created_at', since);
    if ((count ?? 0) > 12) {
      return json({ error: 'That is a lot of ideas for one hour — try again shortly.' }, 429);
    }

    const isDomain = looksLikeDomain(input);
    const siteContext = isDomain ? await fetchSiteContext(input) : '';

    const userPrompt = isDomain
      ? `Website: ${input}\nWhat the site says about itself: ${siteContext || '(nothing readable — infer from the domain name)'}`
      : `Subject or niche they care about: ${input}`;

    const res = await llmFetch(
      {
        body: {
          model: 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 1200,
          response_format: { type: 'json_object' },
        },
      },
      { context: 'feed-ideas' },
    );

    if (!res.ok) {
      const detail = await res.text();
      console.error('feed-ideas model error', res.status, detail);
      return json({ error: 'We could not generate ideas just now. Please try again.' }, res.status);
    }

    const payload = await res.json();
    const raw = payload?.choices?.[0]?.message?.content ?? '';
    let parsed: any;
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      console.error('feed-ideas parse failure', raw.slice(0, 400));
      return json({ error: 'We could not generate ideas just now. Please try again.' }, 502);
    }

    const blueprints = Array.isArray(parsed?.blueprints) ? parsed.blueprints.slice(0, 3) : [];
    if (blueprints.length === 0) {
      return json({ error: 'We could not generate ideas just now. Please try again.' }, 502);
    }

    // Record the anonymous generation (no email yet) for funnel visibility.
    await db.from('feed_leads').insert({
      input_value: input.slice(0, 300),
      input_type: `rl:${ip}`,
      blueprint: { summary: parsed?.summary ?? null, blueprints },
    });

    return json({ summary: parsed?.summary ?? '', blueprints });
  } catch (error) {
    console.error('feed-ideas failed', error);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
