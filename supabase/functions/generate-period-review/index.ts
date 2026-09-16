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
    // Optional scoping: limit the review to chosen categories and/or sources.
    const categoryIds: string[] = Array.isArray(body.categoryIds)
      ? body.categoryIds.filter((v: unknown) => typeof v === 'string' && v.length > 0)
      : [];
    const sourceNames: string[] = Array.isArray(body.sourceNames)
      ? body.sourceNames.filter((v: unknown) => typeof v === 'string' && v.trim().length > 0).map((v: string) => v.trim())
      : [];
    // Preferred source scoping: real source ids, matched on topic_articles.source_id.
    const sourceIds: string[] = Array.isArray(body.sourceIds)
      ? body.sourceIds.filter((v: unknown) => typeof v === 'string' && v.length > 0)
      : [];
    // Parliamentary coverage skews local comparisons, so it is excluded unless asked for.
    const includeParliamentary: boolean = body.includeParliamentary === true;


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

    const { data: topic } = await service.from('topics').select('name, region, slug, description').eq('id', topicId).maybeSingle();

    // PostgREST caps a single response at 1000 rows regardless of .limit(),
    // so page through the topic's articles explicitly — otherwise only a
    // fraction of the archive is ever considered.
    const taIds: string[] = [];
    const taSourceId = new Map<string, string | null>();
    const PAGE = 1000;
    for (let page = 0; page < 60; page++) {
      const from = page * PAGE;
      let q = service
        .from('topic_articles')
        .select('id, source_id')
        .eq('topic_id', topicId);
      if (sourceIds.length > 0) q = q.in('source_id', sourceIds);
      const { data: rows, error } = await q
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) break;
      const batch = rows ?? [];
      for (const r of batch as any[]) {
        taIds.push(r.id);
        taSourceId.set(r.id, r.source_id ?? null);
      }
      if (batch.length < PAGE) break;
    }

    // Name each gathering source, so attribution follows the source the feed
    // collected from rather than a byline the article happened to carry.
    const sourceNameById = new Map<string, string>();
    {
      const { data: srcRows } = await service
        .from('content_sources')
        .select('id, source_name, canonical_domain');
      for (const s of (srcRows ?? []) as any[]) {
        sourceNameById.set(s.id, (s.source_name || s.canonical_domain || '').trim());
      }
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
      is_parliamentary?: boolean | null;
      source_label?: string | null;
    };
    let current: Row[] = [];
    let previous: Row[] = [];


    for (let i = 0; i < taIds.length; i += 200) {
      const chunk = taIds.slice(i, i + 200);
      const { data: rows } = await service
        .from('stories')
        .select('id, title, created_at, cover_illustration_url, slug, publication_name, is_parliamentary, topic_article_id')
        .in('topic_article_id', chunk)
        .eq('is_published', true)
        .gte('created_at', prevStartISO)
        .lte('created_at', endISO);
      for (const r of rows ?? []) {
        const sid = taSourceId.get((r as any).topic_article_id) ?? null;
        const row = {
          ...(r as any),
          source_label: (sid ? sourceNameById.get(sid) : null) || r.publication_name || null,
        } as Row;
        if (r.created_at >= startISO) current.push(row);
        else previous.push(row);
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

    // Parliamentary coverage is kept out of local comparisons unless explicitly included.
    if (!includeParliamentary) {
      const notParliamentary = (r: Row) => r.is_parliamentary !== true;
      current = current.filter(notParliamentary);
      previous = previous.filter(notParliamentary);
    }

    // Apply optional scoping now that we know each story's category + source.
    const useNameScoping = sourceIds.length === 0 && sourceNames.length > 0;
    if (categoryIds.length > 0 || useNameScoping) {
      const catSet = new Set(categoryIds);
      const normalise = (v: string) => v.trim().toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]/g, '');
      const srcSet = new Set(useNameScoping ? sourceNames.map(normalise) : []);
      const keep = (r: Row) => {
        if (srcSet.size > 0 && !srcSet.has(normalise(r.publication_name ?? ''))) return false;
        if (catSet.size > 0) {
          const a = assignments.get(r.id);
          if (!a) return false;
          if (!catSet.has(a.category_id) && !(a.subcategory_id && catSet.has(a.subcategory_id))) return false;
        }
        return true;
      };
      current = current.filter(keep);
      previous = previous.filter(keep);
    }



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
      const name = (r.source_label ?? r.publication_name ?? '').trim();
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
    let anomalies = Object.entries(termMonth)
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
    let risingTerms = Object.entries(termCounts)
      .filter(([term, count]) => count >= 3 && (prevTermCounts[term] ?? 0) === 0)
      .map(([term, count]) => ({ term, count, month: peakMonthOf(term) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
    let fadingTerms = Object.entries(prevTermCounts)
      .filter(([term, count]) => count >= 3 && (termCounts[term] ?? 0) === 0)
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // ---- Places and people ------------------------------------------------
    const places = Object.entries(termCounts)
      .filter(([term, count]) => count >= 2 && term.includes(' ') && PLACE_SUFFIX.test(term))
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
    const entities = Object.entries(termCounts)
      .filter(([term, count]) => count >= 3 && term.includes(' ') && !PLACE_SUFFIX.test(term))
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    // ---- Distinctive terms: what was surprising, not what was expected ----
    // Volume surfaces institutions (the council, the police, the town's own
    // name). Insight lives in terms that are *concentrated* — a burst in one or
    // two months against their own quiet baseline. So: strip anything expected,
    // strip anything that hums along every month, then rank by burstiness.
    const totalStories = Math.max(1, current.length);
    const topicWords = new Set(
      `${topic?.name ?? ''} ${topic?.region ?? ''} ${topic?.description ?? ''}`
        .split(/\W+/)
        .filter((w) => w.length > 3)
        .map((w) => w.toLowerCase())
    );
    const GENERIC_TERMS = new Set([
      // institutions and beats every local feed carries
      'police', 'council', 'councillor', 'councillors', 'borough', 'district', 'county', 'parish',
      'court', 'magistrates', 'crown', 'jailed', 'sentenced', 'charged', 'arrested', 'investigation',
      'hospital', 'ambulance', 'paramedics', 'nhs', 'firefighters', 'coastguard', 'lifeboat',
      'mayor', 'authority', 'government', 'parliament', 'election', 'labour', 'conservative',
      'liberal', 'democrats', 'reform', 'green', 'party', 'mp', 'mps',
      // news furniture
      'news', 'update', 'updates', 'live', 'video', 'watch', 'photos', 'gallery', 'plans', 'plan',
      'warning', 'appeal', 'death', 'died', 'dead', 'crash', 'fire', 'road', 'roads', 'town',
      'area', 'street', 'centre', 'center', 'service', 'services', 'scheme', 'project', 'report',
      'meeting', 'decision', 'review', 'consultation', 'residents', 'community', 'local', 'public',
      // people and time
      'man', 'woman', 'men', 'women', 'people', 'family', 'boy', 'girl', 'teenager', 'driver',
      'week', 'weekend', 'month', 'year', 'today', 'tonight', 'east', 'west', 'north', 'south',
      'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
      'october', 'november', 'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
      'saturday', 'sunday', 'christmas', 'summer', 'winter', 'spring', 'autumn', 'easter',
      'uk', 'britain', 'england', 'english', 'british',
      // parliamentary and civic furniture that recurs in every political headline
      'bill', 'bills', 'act', 'reading', 'amendment', 'commons', 'lords', 'parliament',
      'government', 'minister', 'ministers', 'secretary', 'consultation', 'devolution',
      'empowerment', 'committee', 'scheme', 'plans', 'plan', 'report',
      'best', 'top', 'new', 'here', 'what', 'when', 'where', 'more', 'after', 'over',
    ]);
    // Strip possessives and hyphens so "Eastbourne's" is recognised as the
    // topic's own name rather than slipping through as a distinctive term.
    const words = (term: string) =>
      term
        .toLowerCase()
        .replace(/[\u2019']s\b/g, '')
        .replace(/[\u2019']/g, '')
        .split(/[\s-]+/)
        .filter(Boolean);
    // Expected if it mentions the topic itself, or if every word is furniture.
    const isExpected = (term: string) => {
      const ws = words(term);
      if (ws.some((w) => topicWords.has(w))) return true;
      return ws.every((w) => GENERIC_TERMS.has(w));
    };

    const scored = Object.entries(termCounts)
      .map(([term, count]) => {
        if (count < 3 || isExpected(term)) return null;
        // A term in more than 6% of all headlines is the wallpaper, not the news.
        if (count / totalStories > 0.06) return null;
        const series = months.map((m) => termMonth[term]?.[m] ?? 0);
        const { mean } = stats(series);
        const peak = Math.max(0, ...series);
        const burst = mean > 0 ? peak / mean : 1;
        const monthsPresent = series.filter((v) => v > 0).length;
        // Concentration: share of the term's mentions falling in its peak month.
        const concentration = peak / Math.max(1, count);
        // Anything present in nearly every month at a flat rate is background.
        const spread = monthsPresent / Math.max(1, months.length);
        if (months.length >= 4 && spread > 0.75 && burst < 2) return null;
        if (burst < 1.5 && concentration < 0.4) return null;
        // Rank on anomaly first, volume only as a tiebreaker.
        const score =
          Math.pow(burst, 1.6) *
          (0.6 + concentration) *
          Math.sqrt(count) *
          (term.includes(' ') ? 1.4 : 1);
        return {
          term,
          count,
          peak_month: months[series.indexOf(peak)] ?? null,
          burst: Math.round(burst * 10) / 10,
          concentration: Math.round(concentration * 100) / 100,
          months_present: monthsPresent,
          series,
          score: Math.round(score * 10) / 10,
        };
      })
      .filter(Boolean) as Array<any>;
    scored.sort((a, b) => b.score - a.score);

    // Don't let one story cluster dominate: keep only one term per head word.
    const seenHeads = new Set<string>();
    const deduped = scored.filter((t) => {
      const head = words(t.term).filter((w) => !GENERIC_TERMS.has(w)).pop() ?? t.term;
      if (seenHeads.has(head)) return false;
      seenHeads.add(head);
      return true;
    });

    const distinctiveTerms = deduped.slice(0, 18).map(({ series, ...rest }) => rest);

    // Month-by-month series worth plotting: the sharpest movers, not the steadiest.
    const termTrends = deduped
      .filter((t) => t.months_present >= 2)
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
          if (t.burst >= 3) return 'spiky';
          if (second > first * 1.5) return 'rising';
          if (first > second * 1.5) return 'fading';
          return 'steady';
        })(),
      }));
    const trendMonths = months;

    // Apply the same 'expected' filter to the anomaly and vocabulary lists so
    // institutions and calendar words can't occupy those slides either.
    anomalies = anomalies.filter((a) => !isExpected(a.term));
    risingTerms = risingTerms.filter((t) => !isExpected(t.term));
    fadingTerms = fadingTerms.filter((t) => !isExpected(t.term));


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
        subcategoryInsights,
        subcategoryMovers,
        anomalies,
        distinctiveTerms: distinctiveTerms.slice(0, 12),
        termTrends,
        risingTerms,
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

Aim for insight a reader could not have guessed:
- Lead with sub-beat detail (which kind of crime, which kind of council business), never the parent beat alone.
- Say what changed and when, using peak months and the trend labels.
- Do not state the obvious (that a local feed covers local crime, police or the council). Skip any figure that is merely expected.
- No filler adjectives, no "in conclusion", no restating the data as a list.

Also write one short headline (max 10 words) that captures the single most striking, least obvious fact.

DATA:
${factSheet}

Return ONLY JSON: {"headline":"...","narrative":"three short paragraphs separated by \\n\\n, 150-200 words total"}`,
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

    // Story imagery per beat — powers the image grids in the review deck.
    const storiesByCat: Record<string, { name: string; rows: Row[] }> = {};
    for (const r of current) {
      const a = assignments.get(r.id);
      const cat = a ? (catById.get(a.category_id) as any) : null;
      if (!cat) continue;
      const rec = (storiesByCat[cat.slug] ??= { name: cat.name, rows: [] });
      rec.rows.push(r);
    }
    const categoryStories = categoryBreakdown.slice(0, 5).flatMap((c) => {
      const rec = storiesByCat[c.slug];
      if (!rec) return [];
      const stories = rec.rows
        .map((s) => ({
          id: s.id,
          slug: s.slug,
          title: s.title,
          cover_illustration_url: s.cover_illustration_url,
          created_at: s.created_at,
          views: interactionCounts.get(s.id)?.views ?? 0,
        }))
        // covers first, then engagement, then recency
        .sort(
          (a, b) =>
            Number(!!b.cover_illustration_url) - Number(!!a.cover_illustration_url) ||
            b.views - a.views ||
            b.created_at.localeCompare(a.created_at)
        )
        .slice(0, 6);
      if (stories.length < 3) return [];
      return [{ slug: c.slug, name: c.name, count: c.count, stories }];
    });

    // ---- The archive as pictures -----------------------------------------
    // A dense wall of covers sampled evenly across the period: the opening
    // image of the review, and the clearest statement of its scale.
    const covered = current
      .filter((s) => !!s.cover_illustration_url)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const MOSAIC_MAX = 260;
    const step = Math.max(1, Math.ceil(covered.length / MOSAIC_MAX));
    const mosaic = covered
      .filter((_, i) => i % step === 0)
      .slice(0, MOSAIC_MAX)
      .map((s) => ({ id: s.id, slug: s.slug, title: s.title, cover_illustration_url: s.cover_illustration_url }));

    const viewsOf = (id: string) => interactionCounts.get(id)?.views ?? 0;

    // ---- Month chapters: the defining story of each month ------------------
    const byMonth: Record<string, Row[]> = {};
    for (const r of current) (byMonth[monthKey(r.created_at)] ??= []).push(r);
    const monthChapters = Object.entries(byMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, rows]) => {
        const ranked = [...rows].sort(
          (a, b) =>
            viewsOf(b.id) - viewsOf(a.id) ||
            Number(!!b.cover_illustration_url) - Number(!!a.cover_illustration_url)
        );
        const lead = ranked[0];
        const spikeThisMonth = anomalies.find((a) => a.month === month) ?? null;
        return {
          month,
          count: rows.length,
          spike_term: spikeThisMonth?.term ?? null,
          lead: lead
            ? {
                id: lead.id,
                slug: lead.slug,
                title: lead.title,
                cover_illustration_url: lead.cover_illustration_url,
                views: viewsOf(lead.id),
              }
            : null,
          covers: ranked
            .filter((s) => !!s.cover_illustration_url)
            .slice(0, 8)
            .map((s) => ({ id: s.id, slug: s.slug, title: s.title, cover_illustration_url: s.cover_illustration_url })),
        };
      })
      .filter((m) => m.count > 0);

    // ---- Turning points: the spikes, told as moments ------------------------
    const storyForTerm = (term: string, month?: string, usedImages?: Set<string>) => {
      const needle = term.toLowerCase();
      const pool = current
        .filter((s) => (s.title ?? '').toLowerCase().includes(needle) && (!month || monthKey(s.created_at) === month))
        .sort(
          (a, b) =>
            Number(!!b.cover_illustration_url) - Number(!!a.cover_illustration_url) || viewsOf(b.id) - viewsOf(a.id)
        );
      // Never show the same picture twice in one review.
      const best =
        pool.find((s) => !usedImages || !s.cover_illustration_url || !usedImages.has(s.cover_illustration_url)) ??
        (usedImages ? undefined : pool[0]);
      if (!best) return null;
      if (usedImages && best.cover_illustration_url) usedImages.add(best.cover_illustration_url);
      return { id: best.id, slug: best.slug, title: best.title, cover_illustration_url: best.cover_illustration_url };
    };
    const usedImages = new Set<string>();
    // One turning point per subject: keep the fullest form of a name and drop
    // anything that merely repeats part of it ("Draper" after "Jack Draper"),
    // or that points at the very same story.
    const turningPoints: any[] = [];
    const claimedWords = new Set<string>();
    const claimedStories = new Set<string>();
    const anomalyCandidates = [...anomalies].sort(
      (a, b) => words(b.term).length - words(a.term).length || b.multiple - a.multiple
    );
    for (const a of anomalyCandidates) {
      if (turningPoints.length >= 3) break;
      const ws = words(a.term);
      if (ws.some((w) => claimedWords.has(w))) continue;
      const story = storyForTerm(a.term, a.month, usedImages);
      if (story && claimedStories.has(story.id)) continue;
      ws.forEach((w) => claimedWords.add(w));
      if (story) claimedStories.add(story.id);
      turningPoints.push({ ...a, story });
    }

    // ---- Recurring names and places, each with its defining story ----------
    const recurringSource = (distinctiveTerms.length > 0 ? distinctiveTerms : entities) as any[];
    const recurringEntities: any[] = [];
    const recurringWords = new Set<string>();
    for (const t of recurringSource) {
      if (recurringEntities.length >= 6) break;
      const ws = words(t.term);
      // No fragments of a name already shown, and no repeated pictures.
      if (ws.some((w) => recurringWords.has(w))) continue;
      const story = storyForTerm(t.term, undefined, usedImages);
      if (!story) continue;
      ws.forEach((w) => recurringWords.add(w));
      recurringEntities.push({ term: t.term, count: t.count, peak_month: t.peak_month ?? null, story });
    }

    // ---- What went quiet ----------------------------------------------------
    const wentQuiet = fadingTerms.slice(0, 6).map((t) => ({ term: t.term, previous: t.count }));

    const readingMinutes = Math.round(totalWords / 200);

    const data = {

      summary,
      mosaic,
      monthChapters,
      turningPoints,
      recurringEntities,
      wentQuiet,
      readingMinutes,
      scale,
      headline,
      categoryBreakdown,
      subcategoryBreakdown,
      subcategoryInsights,
      subcategoryMovers,
      distinctiveTerms,
      termTrends,
      trendMonths,
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
      categoryStories,

      filters: {
        categories: categoryIds
          .map((id) => (catById.get(id) as any)?.name)
          .filter(Boolean),
        sources: sourceNames,
        parliamentary: includeParliamentary,
      },
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
