import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { llmFetch } from '../_shared/llm-router.ts';
import { getUser, isAdmin, userOwnsTopic, unauthorized, forbidden } from '../_shared/auth.ts';
import { parseJson } from '../_shared/taxonomy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'has', 'will', 'after', 'over',
  'into', 'says', 'said', 'new', 'year', 'years', 'town', 'people', 'more', 'than', 'been',
  'their', 'they', 'about', 'could', 'would', 'first', 'week', 'day', 'days', 'out', 'off',
]);

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

const PLACE_SUFFIX =
  /\b(Road|Street|Avenue|Lane|Park|Pier|Drive|Way|Square|Close|Hill|Beach|Seafront|Centre|Center|Hospital|School|Station|Bridge|Green|Gardens|Estate|Terrace|Crescent|Court|Market|Common|Wood|Downs|Bay|Harbour|Theatre)\b/;

/** Capitalised unigrams and bigrams from a headline, minus stopwords. */
function extractTerms(title: string): string[] {
  const words = (title ?? '')
    .replace(/[^A-Za-z' -]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const out = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!/^[A-Z]/.test(w)) continue;
    if (STOPWORDS.has(w.toLowerCase())) continue;
    out.add(w);
    if (i + 1 < words.length && /^[A-Z]/.test(words[i + 1])) out.add(`${w} ${words[i + 1]}`);
  }
  return [...out];
}

function stats(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length);
  return { mean, sd: Math.sqrt(variance) };
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const service = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const topicId: string | undefined = body.topicId;
    const periodStart: string | undefined = body.periodStart;
    const periodEnd: string | undefined = body.periodEnd;
    const label: string = body.label || 'Review';
    const slug: string = body.slug || `${periodStart}_${periodEnd}`;

    if (!topicId || !periodStart || !periodEnd) {
      return new Response(JSON.stringify({ error: 'topicId, periodStart and periodEnd are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const user = await getUser(req);
    if (!user) return unauthorized(corsHeaders);
    const allowed = (await userOwnsTopic(service, user.id, topicId)) || (await isAdmin(service, user.id));
    if (!allowed) return forbidden(corsHeaders);

    const startISO = new Date(`${periodStart}T00:00:00Z`).toISOString();
    const endISO = new Date(`${periodEnd}T23:59:59Z`).toISOString();
    const spanMs = new Date(endISO).getTime() - new Date(startISO).getTime();
    const prevStartISO = new Date(new Date(startISO).getTime() - spanMs).toISOString();

    const { data: topic } = await service.from('topics').select('name, region, slug').eq('id', topicId).maybeSingle();

    const { data: topicArticles } = await service
      .from('topic_articles')
      .select('id')
      .eq('topic_id', topicId)
      .limit(20000);
    const taIds = (topicArticles ?? []).map((r: any) => r.id);

    // Fetch published stories in both the current and previous window.
    type Row = {
      id: string;
      title: string;
      created_at: string;
      cover_illustration_url: string | null;
      slug: string | null;
      publication_name: string | null;
    };
    const current: Row[] = [];
    const previous: Row[] = [];

    for (let i = 0; i < taIds.length; i += 200) {
      const chunk = taIds.slice(i, i + 200);
      const { data: rows } = await service
        .from('stories')
        .select('id, title, created_at, cover_illustration_url, slug, publication_name')
        .in('topic_article_id', chunk)
        .eq('is_published', true)
        .gte('created_at', prevStartISO)
        .lte('created_at', endISO);
      for (const r of rows ?? []) {
        if (r.created_at >= startISO) current.push(r as Row);
        else previous.push(r as Row);
      }
    }

    // Category assignments for both windows.
    const allIds = [...current, ...previous].map((s) => s.id);
    const assignments = new Map<string, { category_id: string; subcategory_id: string | null }>();
    for (let i = 0; i < allIds.length; i += 300) {
      const { data } = await service
        .from('story_category_assignments')
        .select('story_id, category_id, subcategory_id')
        .in('story_id', allIds.slice(i, i + 300));
      for (const a of data ?? []) assignments.set(a.story_id, a);
    }

    const { data: categories } = await service
      .from('story_categories')
      .select('id, slug, name, parent_id')
      .or(`topic_id.is.null,topic_id.eq.${topicId}`);
    const catById = new Map((categories ?? []).map((c: any) => [c.id, c]));

    const countByCat = (rows: Row[]) => {
      const counts: Record<string, number> = {};
      for (const r of rows) {
        const a = assignments.get(r.id);
        const cat = a ? catById.get(a.category_id) : null;
        const key = cat?.slug ?? 'uncategorised';
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    };

    const currentCounts = countByCat(current);
    const previousCounts = countByCat(previous);

    const categoryBreakdown = Object.entries(currentCounts)
      .map(([slugKey, count]) => {
        const cat = (categories ?? []).find((c: any) => c.slug === slugKey);
        const prev = previousCounts[slugKey] ?? 0;
        return {
          slug: slugKey,
          name: cat?.name ?? 'Uncategorised',
          count,
          previous: prev,
          change_percent: prev > 0 ? Math.round(((count - prev) / prev) * 100) : null,
        };
      })
      .sort((a, b) => b.count - a.count);

    // Sub-category breakdown (top 15).
    const subCounts: Record<string, number> = {};
    for (const r of current) {
      const a = assignments.get(r.id);
      if (!a?.subcategory_id) continue;
      const sub = catById.get(a.subcategory_id);
      if (sub) subCounts[sub.name] = (subCounts[sub.name] ?? 0) + 1;
    }
    const subcategoryBreakdown = Object.entries(subCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // Monthly timeline.
    const timelineMap: Record<string, number> = {};
    for (const r of current) {
      const key = monthKey(r.created_at);
      timelineMap[key] = (timelineMap[key] ?? 0) + 1;
    }
    const timeline = Object.entries(timelineMap)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Hot topics from headline terms.
    const termCounts: Record<string, number> = {};
    for (const r of current) {
      const words = (r.title ?? '')
        .replace(/[^A-Za-z' -]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3);
      const seen = new Set<string>();
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const isProper = /^[A-Z]/.test(w);
        const lower = w.toLowerCase();
        if (STOPWORDS.has(lower)) continue;
        // Bigrams of consecutive capitalised words capture places, people, organisations.
        if (isProper && i + 1 < words.length && /^[A-Z]/.test(words[i + 1])) {
          const bigram = `${w} ${words[i + 1]}`;
          if (!seen.has(bigram)) {
            termCounts[bigram] = (termCounts[bigram] ?? 0) + 1;
            seen.add(bigram);
          }
        }
        if (isProper && !seen.has(w)) {
          termCounts[w] = (termCounts[w] ?? 0) + 1;
          seen.add(w);
        }
      }
    }
    const hotTopics = Object.entries(termCounts)
      .filter(([, count]) => count >= 3)
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Reader signal.
    const currentIds = current.map((s) => s.id);
    const interactionCounts = new Map<string, { views: number; shares: number }>();
    for (let i = 0; i < currentIds.length; i += 300) {
      const { data } = await service
        .from('story_interactions')
        .select('story_id, interaction_type')
        .in('story_id', currentIds.slice(i, i + 300));
      for (const it of data ?? []) {
        const rec = interactionCounts.get(it.story_id) ?? { views: 0, shares: 0 };
        if (it.interaction_type === 'share_click') rec.shares += 1;
        else rec.views += 1;
        interactionCounts.set(it.story_id, rec);
      }
    }
    const topStories = current
      .map((s) => ({
        id: s.id,
        slug: s.slug,
        title: s.title,
        cover_illustration_url: s.cover_illustration_url,
        created_at: s.created_at,
        views: interactionCounts.get(s.id)?.views ?? 0,
        shares: interactionCounts.get(s.id)?.shares ?? 0,
      }))
      .sort((a, b) => b.views + b.shares * 3 - (a.views + a.shares * 3))
      .slice(0, 8);

    const summary = {
      total_stories: current.length,
      previous_total: previous.length,
      change_percent: previous.length > 0 ? Math.round(((current.length - previous.length) / previous.length) * 100) : null,
      categories_covered: categoryBreakdown.length,
      total_views: topStories.reduce((n, s) => n + s.views, 0),
    };

    // Narrative from the computed numbers only.
    let narrative: string | null = null;
    try {
      const factSheet = JSON.stringify({ summary, categoryBreakdown: categoryBreakdown.slice(0, 12), hotTopics: hotTopics.slice(0, 12), timeline });
      const resp = await llmFetch(
        {
          body: {
            model: 'deepseek-v4-flash',
            messages: [
              {
                role: 'user',
                content: `Write an editor's note reviewing the period ${periodStart} to ${periodEnd} for the ${topic?.name ?? 'local'} news feed.

Use ONLY the figures below — invent nothing, name no story that is not listed. 150-200 words, plain British English, calm and factual, no bullet points, no headings.

DATA:
${factSheet}

Return ONLY JSON: {"narrative":"..."}`,
              },
            ],
            temperature: 0.4,
            max_tokens: 800,
            response_format: { type: 'json_object' },
          },
        },
        { context: 'generate-period-review' }
      );
      if (resp.ok) {
        const json = await resp.json();
        narrative = parseJson<any>(json?.choices?.[0]?.message?.content ?? '')?.narrative ?? null;
      } else {
        console.error('Narrative generation failed:', resp.status, (await resp.text()).slice(0, 300));
      }
    } catch (err) {
      console.error('Narrative generation error:', err instanceof Error ? err.message : err);
    }

    const data = {
      summary,
      categoryBreakdown,
      subcategoryBreakdown,
      timeline,
      hotTopics,
      topStories,
      topic: { name: topic?.name, region: topic?.region, slug: topic?.slug },
    };

    const { data: saved, error: saveError } = await service
      .from('topic_period_reviews')
      .upsert(
        {
          topic_id: topicId,
          slug,
          label,
          period_start: periodStart,
          period_end: periodEnd,
          data,
          narrative,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'topic_id,slug' }
      )
      .select('id, slug')
      .single();
    if (saveError) throw new Error(saveError.message);

    return new Response(JSON.stringify({ review: saved, data, narrative }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('generate-period-review error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
