import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { llmFetch } from '../_shared/llm-router.ts';
import { getUser, isAdmin, userOwnsTopic, unauthorized, forbidden } from '../_shared/auth.ts';
import { loadTaxonomy, taxonomyPrompt, parseJson, CategoryRow } from '../_shared/taxonomy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODEL = 'deepseek-v4-flash';

interface StoryForClassification {
  id: string;
  title: string;
  snippet: string;
}

async function classifyBatch(
  stories: StoryForClassification[],
  categories: CategoryRow[]
): Promise<Array<{ id: string; category: string; subcategory?: string; confidence?: number }>> {
  const prompt = `You are classifying local news stories into a fixed taxonomy.

TAXONOMY (use the slug exactly):
${taxonomyPrompt(categories)}

Rules:
- Choose exactly one primary category slug per story from the parent list.
- Optionally add one sub-category slug, only from that parent's [sub: ...] list.
- confidence is 0-1.
- Missing person appeals and witness appeals belong to missing-persons, not crime.
- Return ONLY a JSON array, no prose.

STORIES:
${stories.map((s) => `${s.id} :: ${s.title} :: ${s.snippet.slice(0, 320)}`).join('\n')}

Return: [{"id":"<story id>","category":"<slug>","subcategory":"<slug or null>","confidence":0.0}]`;

  const resp = await llmFetch(
    {
      body: {
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      },
    },
    { context: 'classify-stories' }
  );

  if (!resp.ok) {
    const body = await resp.text();
    const err = new Error(`LLM request failed [${resp.status}]: ${body.slice(0, 500)}`) as Error & {
      status?: number;
      blocked?: boolean;
    };
    err.status = resp.status;
    // 402/403 are terminal (no credits / workspace limit reached) — never retry
    err.blocked = resp.status === 402 || resp.status === 403;
    throw err;
  }


  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content ?? '';
  const parsed = parseJson<any>(content);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.stories)) return parsed.stories;
  if (Array.isArray(parsed?.results)) return parsed.results;
  return [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const topicId: string | undefined = body.topicId;
    const limit = Math.min(Number(body.limit) || 200, 500);
    const batchSize = Math.min(Number(body.batchSize) || 25, 40);
    const internal = req.headers.get('x-service-token') === SERVICE_KEY;

    if (!topicId) {
      return new Response(JSON.stringify({ error: 'topicId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!internal) {
      const user = await getUser(req);
      if (!user) return unauthorized(corsHeaders);
      const allowed = (await userOwnsTopic(service, user.id, topicId)) || (await isAdmin(service, user.id));
      if (!allowed) return forbidden(corsHeaders);
    }

    const categories = await loadTaxonomy(service, topicId);
    const bySlug = new Map(categories.map((c) => [c.slug, c]));

    const explicitIds: string[] = Array.isArray(body.storyIds)
      ? body.storyIds.filter((v: unknown) => typeof v === 'string').slice(0, 100)
      : [];

    const pending: StoryForClassification[] = [];

    if (explicitIds.length > 0) {
      // Classify-on-ingest: only the stories we were handed, skipping any that
      // already carry an assignment.
      const { data: assigned } = await service
        .from('story_category_assignments')
        .select('story_id')
        .in('story_id', explicitIds);
      const assignedIds = new Set((assigned ?? []).map((r: any) => r.story_id));

      const { data: stories } = await service
        .from('stories')
        .select('id, title')
        .in('id', explicitIds);

      for (const s of stories ?? []) {
        if (assignedIds.has(s.id)) continue;
        pending.push({ id: s.id, title: s.title ?? '', snippet: '' });
      }
    } else {
      // Stories in this topic that have no assignment yet.
      const { data: topicArticles, error: taError } = await service
        .from('topic_articles')
        .select('id')
        .eq('topic_id', topicId)
        .limit(20000);
      if (taError) throw new Error(taError.message);

      const taIds = (topicArticles ?? []).map((r: any) => r.id);
      if (taIds.length === 0) {
        return new Response(JSON.stringify({ processed: 0, remaining: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: assigned } = await service
        .from('story_category_assignments')
        .select('story_id')
        .eq('topic_id', topicId)
        .limit(20000);
      const assignedIds = new Set((assigned ?? []).map((r: any) => r.story_id));

      const chunkSize = 200;
      for (let i = 0; i < taIds.length && pending.length < limit; i += chunkSize) {
        const { data: stories } = await service
          .from('stories')
          .select('id, title, topic_article_id')
          .in('topic_article_id', taIds.slice(i, i + chunkSize))
          .order('created_at', { ascending: false });

        for (const s of stories ?? []) {
          if (assignedIds.has(s.id)) continue;
          pending.push({ id: s.id, title: s.title ?? '', snippet: '' });
          if (pending.length >= limit) break;
        }
      }
    }


    // Enrich with the opening slide for context.
    const ids = pending.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data: slides } = await service
        .from('slides')
        .select('story_id, content, slide_number')
        .in('story_id', ids.slice(i, i + 200))
        .eq('slide_number', 1);
      const map = new Map((slides ?? []).map((s: any) => [s.story_id, s.content]));
      for (const p of pending) if (map.has(p.id)) p.snippet = String(map.get(p.id) ?? '');
    }

    let processed = 0;
    let failed = 0;
    let blockedMessage: string | null = null;


    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      try {
        const results = await classifyBatch(batch, categories);

        // Repair hallucinated/truncated IDs: the LLM sometimes returns an id
        // with a typo or a missing character, which would poison the upsert.
        // Match each returned id against this batch's real ids; drop anything
        // that can't be matched instead of failing the whole batch.
        const batchIds = batch.map((b) => b.id);
        const resolveId = (raw: unknown): string | null => {
          if (typeof raw !== 'string') return null;
          const cleaned = raw.trim().toLowerCase();
          if (batchIds.includes(cleaned)) return cleaned;
          const hexOnly = cleaned.replace(/[^0-9a-f]/g, '');
          if (hexOnly.length < 8) return null;
          const match = batchIds.find((id) => {
            const idHex = id.replace(/-/g, '');
            return idHex.startsWith(hexOnly) || hexOnly.startsWith(idHex) ||
              idHex.includes(hexOnly) || hexOnly.includes(idHex);
          });
          return match ?? null;
        };

        const rows = results
          .map((r) => {
            const storyId = resolveId(r.id);
            if (!storyId) return null;
            const cat = bySlug.get(String(r.category ?? '').trim());
            if (!cat || cat.parent_id) return null;
            const sub = r.subcategory ? bySlug.get(String(r.subcategory).trim()) : null;
            return {
              story_id: storyId,
              topic_id: topicId,
              category_id: cat.id,
              subcategory_id: sub && sub.parent_id === cat.id ? sub.id : null,
              confidence: Math.max(0, Math.min(1, Number(r.confidence ?? 0.5))),
              model: MODEL,
            };
          })
          .filter(Boolean) as any[];

        // De-dupe in case the LLM returned the same story twice.
        const seen = new Set<string>();
        const deduped = rows.filter((r) => (seen.has(r.story_id) ? false : (seen.add(r.story_id), true)));

        if (rows.length) {
          const { error } = await service
            .from('story_category_assignments')
            .upsert(rows, { onConflict: 'story_id' });
          if (error) throw new Error(error.message);
          processed += rows.length;
        }
      } catch (err) {
        failed += batch.length;
        const message = err instanceof Error ? err.message : String(err);
        console.error('Batch classification failed:', message);
        if ((err as any)?.blocked) {
          // AI credits exhausted or workspace limit reached — stop immediately
          blockedMessage = message;
          console.error('⛔ [classify-stories] AI access blocked, aborting remaining batches');
          break;
        }
      }
    }

    return new Response(
      JSON.stringify({
        processed,
        failed,
        requested: pending.length,
        remaining: Math.max(0, pending.length - processed - failed),
        blocked: Boolean(blockedMessage),
        error: blockedMessage
          ? 'AI classification is blocked: the workspace AI credit limit has been reached (and the DeepSeek balance is empty). Raise the limit or top up, then re-run.'
          : undefined,
      }),
      { status: blockedMessage ? 402 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('classify-stories error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
