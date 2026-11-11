import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { llmFetch } from '../_shared/llm-router.ts';
import { getUser, isAdmin, userOwnsTopic, unauthorized, forbidden } from '../_shared/auth.ts';
import { parseJsonSalvage, usesGlobalTaxonomy } from '../_shared/taxonomy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Samples published story titles for a topic and asks the model to propose a
 * category / sub-category tree grounded in what was actually published.
 * The proposal is stored for review — nothing is applied automatically.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const service = createClient(SUPABASE_URL, SERVICE_KEY);
  let runId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const topicId: string | undefined = body.topicId;
    const sampleSize = Math.min(Number(body.sampleSize) || 400, 800);

    if (!topicId) {
      return new Response(JSON.stringify({ error: 'topicId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const user = await getUser(req);
    if (!user) return unauthorized(corsHeaders);
    const allowed = (await userOwnsTopic(service, user.id, topicId)) || (await isAdmin(service, user.id));
    if (!allowed) return forbidden(corsHeaders);

    const { data: run } = await service
      .from('taxonomy_discovery_runs')
      .insert({ topic_id: topicId, status: 'running' })
      .select('id')
      .single();
    runId = run?.id ?? null;

    const { data: topic } = await service
      .from('topics')
      .select('name, description, topic_type, keywords')
      .eq('id', topicId)
      .maybeSingle();
    const isLocal = usesGlobalTaxonomy(topic?.topic_type);

    const { data: topicArticles } = await service
      .from('topic_articles')
      .select('id')
      .eq('topic_id', topicId)
      .limit(20000);
    const taIds = (topicArticles ?? []).map((r: any) => r.id);

    // Prefer published headlines; a new feed falls back to drafts, then to
    // the articles waiting in Arrivals, so suggestions work from day one.
    const titles: string[] = [];
    const seen = new Set<string>();
    const push = (t: string | null | undefined) => {
      const v = (t ?? '').trim();
      if (!v || seen.has(v.toLowerCase()) || titles.length >= sampleSize) return;
      seen.add(v.toLowerCase());
      titles.push(v);
    };
    for (const publishedOnly of [true, false]) {
      for (let i = 0; i < taIds.length && titles.length < sampleSize; i += 200) {
        let q = service
          .from('stories')
          .select('title, created_at')
          .in('topic_article_id', taIds.slice(i, i + 200))
          .order('created_at', { ascending: false });
        if (publishedOnly) q = q.eq('is_published', true);
        const { data: stories } = await q;
        for (const st of stories ?? []) push(st.title);
      }
      if (titles.length >= 15) break;
    }
    if (titles.length < 15) {
      const { data: arrivals } = await service
        .from('topic_articles')
        .select('shared_article_content(title)')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false })
        .limit(200);
      for (const a of arrivals ?? []) {
        const c = (a as any).shared_article_content;
        push(Array.isArray(c) ? c[0]?.title : c?.title);
      }
    }

    const keywords: string[] = Array.isArray(topic?.keywords) ? topic!.keywords.slice(0, 40) : [];
    if (titles.length === 0 && keywords.length === 0) {
      throw new Error('Add some sources or keywords first, so there is something to base categories on.');
    }

    const feedLine = `Feed name: ${topic?.name ?? 'Untitled'}${topic?.description ? `\nAbout: ${topic.description}` : ''}${keywords.length ? `\nKeywords: ${keywords.join(', ')}` : ''}`;

    const prompt = isLocal
      ? `Below are ${titles.length} headlines published by a local news feed.

Propose a category / sub-category taxonomy that fits this coverage. Aim for 8-14 top-level categories and 2-6 sub-categories each. Use lowercase-hyphen slugs. Include an approximate count of how many of the sampled headlines fall into each top-level category, and two example headlines.

Return ONLY JSON:
{"categories":[{"slug":"","name":"","description":"","approx_count":0,"examples":["",""],"subcategories":[{"slug":"","name":""}]}]}

HEADLINES:
${titles.map((t) => `- ${t}`).join('\n')}`
      : `You are organising a specialist subject feed, NOT a local news site.

${feedLine}

Propose categories a reader of this subject would naturally browse by — themes within the subject itself (for a data science feed: e.g. "Models & Research", "Tools & Platforms", "Industry Adoption", "Policy & Ethics"). Do not use generic local-news sections such as crime, council, planning, transport, weather, sport or housing unless the subject is genuinely about them.

Aim for 5-9 top-level categories, each with a one-line description and 0-4 sub-categories. Names short (1-3 words, "&" allowed). Use lowercase-hyphen slugs. Include an approximate count of how many of the sample headlines fall into each category, and up to two example headlines.

Return ONLY JSON:
{"categories":[{"slug":"","name":"","description":"","approx_count":0,"examples":["",""],"subcategories":[{"slug":"","name":""}]}]}

${titles.length ? `SAMPLE HEADLINES:\n${titles.map((t) => `- ${t}`).join('\n')}` : 'No headlines yet — base the categories on the feed details above.'}`;

    const resp = await llmFetch(
      {
        body: {
          model: 'deepseek-v4-pro',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 16000,
          response_format: { type: 'json_object' },
        },
      },
      { context: 'discover-taxonomy' }
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`LLM request failed [${resp.status}]: ${text.slice(0, 500)}`);
    }

    const json = await resp.json();
    const proposal = parseJsonSalvage<any>(json?.choices?.[0]?.message?.content ?? '');

    if (runId) {
      await service
        .from('taxonomy_discovery_runs')
        .update({ status: 'complete', sample_size: titles.length, proposal })
        .eq('id', runId);
    }

    return new Response(JSON.stringify({ runId, sampleSize: titles.length, proposal }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('discover-taxonomy error:', message);
    if (runId) {
      await service.from('taxonomy_discovery_runs').update({ status: 'failed', error: message }).eq('id', runId);
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
