/**
 * Deep recovery: only runs when the normal scraping path produced no articles.
 *
 * Safety contract:
 *  - Never called unless the existing pipeline already returned zero articles.
 *  - Never throws; on any error it returns a zero result and the caller carries
 *    on with its existing behaviour exactly as before.
 *  - Stores articles through the same storeArticles path as every other method,
 *    so relevance, age, duplicate and quality rules all still apply.
 *  - AI extraction is capped per run and by a project-wide daily budget.
 */

import { discoverArticleUrls } from './discovery-fallback.ts';
import { extractArticleWithAi } from './ai-page-extractor.ts';
import { aiPagesUsedToday } from './scrape-run-logger.ts';

const DAILY_AI_PAGE_BUDGET = 200;

export interface DeepRecoveryResult {
  stored: number;
  method: string | null;
  methodsTried: string[];
  urlsDiscovered: number;
  urlsNew: number;
  aiPagesUsed: number;
  error?: string;
}

const EMPTY: DeepRecoveryResult = {
  stored: 0,
  method: null,
  methodsTried: [],
  urlsDiscovered: 0,
  urlsNew: 0,
  aiPagesUsed: 0,
};

export async function attemptDeepRecovery(
  supabase: any,
  dbOps: { storeArticles: (...args: any[]) => Promise<any> },
  params: {
    sourceUrl: string;
    sourceId: string;
    sourceName: string;
    topicId: string;
    maxAgeDays: number;
    scrapingConfig?: Record<string, any>;
    maxAiPages?: number;
  },
): Promise<DeepRecoveryResult> {
  const config = params.scrapingConfig || {};
  if (config.skip_deep_recovery === true) return EMPTY;

  try {
    // 1. Discover candidate URLs (sitemaps, then JSON-LD)
    const discovery = await discoverArticleUrls(params.sourceUrl, {
      maxAgeDays: params.maxAgeDays,
      limit: 10,
    });

    // Attribution guard: only keep URLs on the source's own domain. Some
    // publishers share one sitemap across a group of titles, and stories must
    // stay attributed to the publication they actually came from.
    const registrable = (raw: string): string => {
      try {
        const host = new URL(raw).hostname.replace(/^www\./, '').toLowerCase();
        const parts = host.split('.');
        return parts.length > 2 ? parts.slice(-3).join('.') : host;
      } catch {
        return '';
      }
    };
    const sourceDomain = registrable(params.sourceUrl);
    const onDomain = discovery.urls.filter(u => registrable(u.url) === sourceDomain);
    if (onDomain.length !== discovery.urls.length) {
      console.log(
        `🧭 Deep recovery dropped ${discovery.urls.length - onDomain.length} off-domain URL(s) for ${params.sourceName}`,
      );
    }
    discovery.urls = onDomain;

    if (discovery.urls.length === 0) {
      return { ...EMPTY, methodsTried: discovery.methodsTried, error: discovery.error };
    }

    console.log(
      `🧭 Deep recovery for ${params.sourceName}: ${discovery.urls.length} candidate URL(s) via ${discovery.method}`,
    );

    // 2. Drop URLs we already hold
    const candidateUrls = discovery.urls.map(u => u.url);
    const { data: existing } = await supabase
      .from('articles')
      .select('source_url')
      .in('source_url', candidateUrls);
    const seen = new Set((existing || []).map((r: any) => r.source_url));
    const fresh = discovery.urls.filter(u => !seen.has(u.url));

    if (fresh.length === 0) {
      return {
        ...EMPTY,
        method: discovery.method,
        methodsTried: discovery.methodsTried,
        urlsDiscovered: discovery.urls.length,
      };
    }

    // 3. AI extraction, capped per run and per day
    const perRunCap = Math.max(0, Math.min(params.maxAiPages ?? 3, 5));
    let budgetLeft = perRunCap;
    if (budgetLeft > 0) {
      const usedToday = await aiPagesUsedToday(supabase);
      budgetLeft = Math.max(0, Math.min(budgetLeft, DAILY_AI_PAGE_BUDGET - usedToday));
      if (budgetLeft === 0) {
        console.log(`💸 Deep recovery: daily AI extraction budget reached, skipping ${params.sourceName}`);
      }
    }

    const articles: any[] = [];
    let aiPagesUsed = 0;
    for (const candidate of fresh.slice(0, budgetLeft)) {
      const extracted = await extractArticleWithAi(candidate.url);
      aiPagesUsed++;
      if (extracted) {
        articles.push({
          title: extracted.title,
          body: extracted.body,
          author: extracted.author || undefined,
          published_at: extracted.published_at || candidate.publishedAt || undefined,
          source_url: extracted.source_url,
          image_url: extracted.image_url || undefined,
          word_count: extracted.body.split(/\s+/).length,
          language: 'en',
        });
      }
    }

    if (articles.length === 0) {
      return {
        ...EMPTY,
        method: discovery.method,
        methodsTried: [...discovery.methodsTried, 'ai-extract'],
        urlsDiscovered: discovery.urls.length,
        urlsNew: fresh.length,
        aiPagesUsed,
      };
    }

    // 4. Store through the standard path so all existing rules still apply
    const storeResult = await dbOps.storeArticles(
      articles,
      params.topicId,
      params.sourceId,
      params.maxAgeDays,
      config,
    );

    const stored = storeResult?.articlesStored || 0;
    console.log(`🧭 Deep recovery stored ${stored} article(s) for ${params.sourceName}`);

    return {
      stored,
      method: `${discovery.method}+ai-extract`,
      methodsTried: [...discovery.methodsTried, 'ai-extract'],
      urlsDiscovered: discovery.urls.length,
      urlsNew: fresh.length,
      aiPagesUsed,
    };
  } catch (error) {
    console.warn(
      `(non-fatal) deep recovery failed for ${params.sourceName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ...EMPTY, error: error instanceof Error ? error.message : String(error) };
  }
}
