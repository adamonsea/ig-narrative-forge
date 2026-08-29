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

    // PostgREST caps a single response at 1000 rows regardless of .limit(),
    // so page through the topic's articles explicitly — otherwise only a
    // fraction of the archive is ever considered.
    const taIds: string[] = [];
    const PAGE = 1000;
    for (let page = 0; page < 60; page++) {
      const from = page * PAGE;
      const { data: rows, error } = await service
        .from('topic_articles')
        .select('id')
        .eq('topic_id', topicId)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) break;
      const batch = rows ?? [];
      taIds.push(...batch.map((r: any) => r.id));
      if (batch.length < PAGE) break;
    }

    // Fetch every row matching an `in (...)` filter, paging past the
    // PostgREST 1000-row response cap (slides/interactions are many-per-story).
    const fetchAllIn = async (
      table: string,
      columns: string,
      column: string,
      ids: string[],
      chunkSize = 200
    ): Promise<any[]> => {
      const out: any[] = [];
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        for (let page = 0; page < 40; page++) {
          const from = page * 1000;
          const { data, error } = await service
            .from(table)
            .select(columns)
            .in(column, chunk)
            .order(column, { ascending: true })
            .range(from, from + 999);
          if (error) break;
          const rows = data ?? [];
          out.push(...rows);
          if (rows.length < 1000) break;
        }
      }
      return out;
    };


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
    for (const a of await fetchAllIn(
      'story_category_assignments',
      'story_id, category_id, subcategory_id',
      'story_id',
      allIds
    )) {
      assignments.set(a.story_id, a);
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

    // ---- Scale of the archive -------------------------------------------
    const currentIdList = current.map((s) => s.id);
    let totalWords = 0;
    for (const sl of await fetchAllIn('slides', 'word_count, content, story_id', 'story_id', currentIdList)) {
      totalWords += sl.word_count ?? String(sl.content ?? '').split(/\s+/).filter(Boolean).length;
    }

    const dayCounts: Record<string, number> = {};
    for (const r of current) {
      const d = r.created_at.slice(0, 10);
      dayCounts[d] = (dayCounts[d] ?? 0) + 1;
    }
    const busiest = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0] ?? null;

    const sourceCounts: Record<string, number> = {};
    for (const r of current) {
      const name = (r.publication_name ?? '').trim();
      if (!name) continue;
      sourceCounts[name] = (sourceCounts[name] ?? 0) + 1;
    }
    const sourceScorecard = Object.entries(sourceCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const scale = {
      total_stories: current.length,
      total_words: totalWords,
      avg_words: current.length ? Math.round(totalWords / current.length) : 0,
      source_count: Object.keys(sourceCounts).length,
      busiest_day: busiest ? { date: busiest[0], count: busiest[1] } : null,
      days_covered: Object.keys(dayCounts).length,
    };

    // ---- Crime / council sub-breakdowns ----------------------------------
    const subCountsFor = (rows: Row[], parentMatch: RegExp) => {
      const counts: Record<string, number> = {};
      for (const r of rows) {
        const a = assignments.get(r.id);
        if (!a) continue;
        const parent = catById.get(a.category_id) as any;
        if (!parent || !parentMatch.test(parent.slug)) continue;
        const sub = a.subcategory_id ? (catById.get(a.subcategory_id) as any) : null;
        const key = sub?.name ?? 'Other';
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    };
    const buildBreakdown = (match: RegExp) => {
      const now = subCountsFor(current, match);
      const before = subCountsFor(previous, match);
      const total = Object.values(now).reduce((a, b) => a + b, 0);
      return {
        total,
        items: Object.entries(now)
          .map(([name, count]) => {
            const prev = before[name] ?? 0;
            return {
              name,
              count,
              previous: prev,
              change_percent: prev > 0 ? Math.round(((count - prev) / prev) * 100) : null,
            };
          })
          .sort((a, b) => b.count - a.count),
      };
    };
    const crimeBreakdown = buildBreakdown(/crime|police|court/);
    const councilBreakdown = buildBreakdown(/council|politic|planning|development/);

    // ---- Anomalies: months where a term spiked above its own baseline ----
    const months = timeline.map((t) => t.month);
    const termMonth: Record<string, Record<string, number>> = {};
    for (const r of current) {
      const m = monthKey(r.created_at);
      for (const t of extractTerms(r.title)) {
        (termMonth[t] ??= {})[m] = (termMonth[t][m] ?? 0) + 1;
      }
    }
    const anomalies = Object.entries(termMonth)
      .map(([term, byMonth]) => {
        const series = months.map((m) => byMonth[m] ?? 0);
        const total = series.reduce((a, b) => a + b, 0);
        if (total < 5 || months.length < 3) return null;
        const { mean, sd } = stats(series);
        const peak = Math.max(...series);
        const peakMonth = months[series.indexOf(peak)];
        if (peak < 3 || sd === 0 || peak < mean + 2 * sd) return null;
        return {
          term,
          month: peakMonth,
          count: peak,
          baseline: Math.round(mean * 10) / 10,
          multiple: Math.round((peak / Math.max(0.5, mean)) * 10) / 10,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.multiple - a.multiple)
      .slice(0, 8) as Array<{ term: string; month: string; count: number; baseline: number; multiple: number }>;

    // ---- Rising and fading vocabulary ------------------------------------
    const prevTermCounts: Record<string, number> = {};
    for (const r of previous) {
      for (const t of extractTerms(r.title)) prevTermCounts[t] = (prevTermCounts[t] ?? 0) + 1;
    }
    const peakMonthOf = (term: string) => {
      const byMonth = termMonth[term] ?? {};
      const entries = Object.entries(byMonth).sort((a, b) => b[1] - a[1]);
      return entries[0]?.[0] ?? null;
    };
    const risingTerms = Object.entries(termCounts)
      .filter(([term, count]) => count >= 3 && (prevTermCounts[term] ?? 0) === 0)
      .map(([term, count]) => ({ term, count, month: peakMonthOf(term) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
    const fadingTerms = Object.entries(prevTermCounts)
      .filter(([term, count]) => count >= 3 && (termCounts[term] ?? 0) === 0)
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // ---- Places and people ------------------------------------------------
    const places = Object.entries(termCounts)
      .filter(([term, count]) => count >= 2 && PLACE_SUFFIX.test(term))
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
    const entities = Object.entries(termCounts)
      .filter(([term, count]) => count >= 3 && term.includes(' ') && !PLACE_SUFFIX.test(term))
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    // ---- Distinctive terms: what was surprising, not what was expected ----
    // Raw frequency surfaces the obvious (the town's own name, "police",
    // "council"). Instead: drop terms that are generic or appear in a large
    // share of headlines, then rank by volume × burstiness.
    const totalStories = Math.max(1, current.length);
    const topicWords = new Set(
      `${topic?.name ?? ''} ${topic?.region ?? ''}`
        .split(/\W+/)
        .filter(Boolean)
        .map((w) => w.toLowerCase())
    );
    const GENERIC_TERMS = new Set([
      'police', 'council', 'court', 'news', 'update', 'live', 'video', 'watch', 'plans', 'plan',
      'warning', 'appeal', 'death', 'died', 'crash', 'fire', 'road', 'roads', 'town', 'area',
      'week', 'weekend', 'east', 'west', 'north', 'south', 'uk', 'britain', 'england', 'british',
      'man', 'woman', 'men', 'women', 'people', 'family', 'local', 'residents', 'community',
      'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
      'october', 'november', 'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
      'saturday', 'sunday', 'christmas', 'summer', 'winter', 'spring', 'autumn', 'best', 'top',
      'here', 'what', 'when', 'where', 'why', 'how', 'now', 'still', 'back', 'again',
    ]);
    const isExpected = (term: string) =>
      term
        .toLowerCase()
        .split(' ')
        .every((w) => topicWords.has(w) || GENERIC_TERMS.has(w));

    const scored = Object.entries(termCounts)
      .map(([term, count]) => {
        if (count < 4 || isExpected(term)) return null;
        // A term in more than 12% of all headlines is the wallpaper, not the news.
        if (count / totalStories > 0.12) return null;
        const series = months.map((m) => termMonth[term]?.[m] ?? 0);
        const { mean } = stats(series);
        const peak = Math.max(0, ...series);
        const burst = mean > 0 ? peak / mean : 1;
        const monthsPresent = series.filter((v) => v > 0).length;
        const score = count * (1 + Math.log(1 + burst)) * (term.includes(' ') ? 1.35 : 1);
        return {
          term,
          count,
          peak_month: months[series.indexOf(peak)] ?? null,
          burst: Math.round(burst * 10) / 10,
          months_present: monthsPresent,
          series,
          score: Math.round(score * 10) / 10,
        };
      })
      .filter(Boolean) as Array<any>;
    scored.sort((a, b) => b.score - a.score);

    const distinctiveTerms = scored.slice(0, 18).map(({ series, ...rest }) => rest);

    // Month-by-month series for the terms worth plotting (persistent, not one-hit).
    const termTrends = scored
      .filter((t) => t.months_present >= 3)
      .slice(0, 6)
      .map((t) => ({
        term: t.term,
        total: t.count,
        series: t.series,
        peak_month: t.peak_month,
        trend: (() => {
          const half = Math.floor(t.series.length / 2) || 1;
          const first = t.series.slice(0, half).reduce((a: number, b: number) => a + b, 0);
          const second = t.series.slice(half).reduce((a: number, b: number) => a + b, 0);
          if (second > first * 1.5) return 'rising';
          if (first > second * 1.5) return 'fading';
          if (t.burst >= 3) return 'spiky';
          return 'steady';
        })(),
      }));
    const trendMonths = months;

    // ---- Sub-category insight across the whole taxonomy -------------------
    // Not just crime and council: every parent beat that actually splits.
    const parentSubs: Record<
      string,
      { name: string; slug: string; total: number; subs: Record<string, number>; months: Record<string, Record<string, number>> }
    > = {};
    const prevParentSubs: Record<string, Record<string, number>> = {};
    for (const r of current) {
      const a = assignments.get(r.id);
      if (!a?.subcategory_id) continue;
      const parent = catById.get(a.category_id) as any;
      const sub = catById.get(a.subcategory_id) as any;
      if (!parent || !sub) continue;
      const rec = (parentSubs[parent.slug] ??= {
        name: parent.name,
        slug: parent.slug,
        total: 0,
        subs: {},
        months: {},
      });
      rec.total += 1;
      rec.subs[sub.name] = (rec.subs[sub.name] ?? 0) + 1;
      const m = monthKey(r.created_at);
      ((rec.months[sub.name] ??= {})[m] = (rec.months[sub.name][m] ?? 0) + 1);
    }
    for (const r of previous) {
      const a = assignments.get(r.id);
      if (!a?.subcategory_id) continue;
      const parent = catById.get(a.category_id) as any;
      const sub = catById.get(a.subcategory_id) as any;
      if (!parent || !sub) continue;
      const rec = (prevParentSubs[parent.slug] ??= {});
      rec[sub.name] = (rec[sub.name] ?? 0) + 1;
    }

    const subcategoryInsights = Object.values(parentSubs)
      .filter((p) => Object.keys(p.subs).length >= 2 && p.total >= 6)
      .map((p) => {
        const prev = prevParentSubs[p.slug] ?? {};
        const items = Object.entries(p.subs)
          .map(([name, count]) => {
            const byMonth = p.months[name] ?? {};
            const peak = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0] ?? null;
            const before = prev[name] ?? 0;
            return {
              name,
              count,
              share: Math.round((count / p.total) * 100),
              previous: before,
              change_percent: before > 0 ? Math.round(((count - before) / before) * 100) : null,
              peak_month: peak ? peak[0] : null,
            };
          })
          .sort((a, b) => b.count - a.count);
        const lead = items[0];
        return {
          slug: p.slug,
          name: p.name,
          total: p.total,
          items: items.slice(0, 8),
          concentration: lead ? lead.share : 0,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    // The sub-beats that moved hardest, across every parent category.
    const subcategoryMovers = subcategoryInsights
      .flatMap((p) =>
        p.items
          .filter((i) => i.change_percent != null && Math.abs(i.change_percent) >= 25 && i.count + i.previous >= 6)
          .map((i) => ({ parent: p.name, ...i }))
      )
      .sort((a, b) => Math.abs(b.change_percent ?? 0) - Math.abs(a.change_percent ?? 0))
      .slice(0, 6);


    // Reader signal.
    const currentIds = current.map((s) => s.id);
    const interactionCounts = new Map<string, { views: number; shares: number }>();
    {
      for (const it of await fetchAllIn(
        'story_interactions',
        'story_id, interaction_type',
        'story_id',
        currentIds
      )) {
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


    // Reads per story by category — which beat actually earned attention.
    const perfByCat: Record<string, { name: string; stories: number; views: number }> = {};
    for (const r of current) {
      const a = assignments.get(r.id);
      const cat = a ? (catById.get(a.category_id) as any) : null;
      const key = cat?.slug ?? 'uncategorised';
      const rec = (perfByCat[key] ??= { name: cat?.name ?? 'Uncategorised', stories: 0, views: 0 });
      rec.stories += 1;
      rec.views += interactionCounts.get(r.id)?.views ?? 0;
    }
    const categoryPerformance = Object.entries(perfByCat)
      .filter(([, v]) => v.stories >= 3)
      .map(([slugKey, v]) => ({
        slug: slugKey,
        name: v.name,
        stories: v.stories,
        views: v.views,
        reads_per_story: Math.round((v.views / v.stories) * 10) / 10,
      }))
      .sort((a, b) => b.reads_per_story - a.reads_per_story)
      .slice(0, 8);

    const summary = {
      total_stories: current.length,
      previous_total: previous.length,
      change_percent: previous.length > 0 ? Math.round(((current.length - previous.length) / previous.length) * 100) : null,
      categories_covered: categoryBreakdown.length,
      total_views: topStories.reduce((n, s) => n + s.views, 0),
      total_words: totalWords,
    };


    // Narrative from the computed numbers only.
    let narrative: string | null = null;
    let headline: string | null = null;
    try {
      const factSheet = JSON.stringify({
        summary,
        scale,
        categoryBreakdown: categoryBreakdown.slice(0, 12),
        crimeBreakdown,
        councilBreakdown,
        anomalies,
        risingTerms,
        hotTopics: hotTopics.slice(0, 12),
        timeline,
      });
      const resp = await llmFetch(
        {
          body: {
            model: 'deepseek-v4-flash',
            messages: [
              {
                role: 'user',
                content: `Write an editor's note reviewing the period ${periodStart} to ${periodEnd} for the ${topic?.name ?? 'local'} news feed.

Use ONLY the figures below — invent nothing, name no story that is not listed. Plain British English, confident and specific, no bullet points, no headings.

Also write one short headline (max 10 words) that captures the single most striking fact.

DATA:
${factSheet}

Return ONLY JSON: {"headline":"...","narrative":"three short paragraphs separated by \\n\\n, 180-240 words total"}`,
              },
            ],
            temperature: 0.4,
            max_tokens: 1200,
            response_format: { type: 'json_object' },
          },
        },
        { context: 'generate-period-review' }
      );
      if (resp.ok) {
        const json = await resp.json();
        const parsed = parseJson<any>(json?.choices?.[0]?.message?.content ?? '');
        narrative = parsed?.narrative ?? null;
        headline = parsed?.headline ?? null;
      } else {
        console.error('Narrative generation failed:', resp.status, (await resp.text()).slice(0, 300));
      }
    } catch (err) {
      console.error('Narrative generation error:', err instanceof Error ? err.message : err);
    }

    const data = {
      summary,
      scale,
      headline,
      categoryBreakdown,
      subcategoryBreakdown,
      crimeBreakdown,
      councilBreakdown,
      anomalies,
      risingTerms,
      fadingTerms,
      places,
      entities,
      categoryPerformance,
      sourceScorecard,
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
