import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { llmFetch } from '../_shared/llm-router.ts';
import { getUser, isAdmin, userOwnsTopic, unauthorized, forbidden } from '../_shared/auth.ts';
import { parseJsonSalvage } from '../_shared/taxonomy.ts';

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

    const { data: topicArticles } = await service
      .from('topic_articles')
      .select('id')
      .eq('topic_id', topicId)
      .limit(20000);
    const taIds = (topicArticles ?? []).map((r: any) => r.id);

    const titles: string[] = [];
    for (let i = 0; i < taIds.length && titles.length < sampleSize; i += 200) {
      const { data: stories } = await service
        .from('stories')
        .select('title, created_at')
        .in('topic_article_id', taIds.slice(i, i + 200))
        .eq('is_published', true)
        .order('created_at', { ascending: false });
      for (const s of stories ?? []) {
        if (s.title) titles.push(s.title);
        if (titles.length >= sampleSize) break;
      }
    }

    if (titles.length === 0) throw new Error('No published stories to sample');

    const prompt = `Below are ${titles.length} headlines published by a local news feed.

Propose a category / sub-category taxonomy that fits this coverage. Aim for 8-14 top-level categories and 2-6 sub-categories each. Use lowercase-hyphen slugs. Include an approximate count of how many of the sampled headlines fall into each top-level category, and two example headlines.

Return ONLY JSON:
{"categories":[{"slug":"","name":"","description":"","approx_count":0,"examples":["",""],"subcategories":[{"slug":"","name":""}]}]}

HEADLINES:
${titles.map((t) => `- ${t}`).join('\n')}`;

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
