// Phase 1 Scraping Improvements: Adaptive Strategy Memory, Quality Trend Tracking, Domain Profile Auto-Enrichment
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ===========================
// 1. ADAPTIVE STRATEGY MEMORY
// ===========================

export interface AdaptiveStrategyHint {
  method: string | null;
  executionMs: number | null;
  shouldFastTrack: boolean;
}

/**
 * Checks if a source has a remembered successful method and returns it as a fast-track hint.
 * Falls through gracefully if no memory exists.
 */
export function getAdaptiveStrategyHint(source: any): AdaptiveStrategyHint {
  const method = source.last_successful_method;
  const executionMs = source.last_method_execution_ms;

  // Fast-track if we have a remembered method
  if (method && typeof method === 'string') {
    console.log(`🧠 Adaptive memory: source previously succeeded with "${method}" (${executionMs ?? '?'}ms)`);
    return { method, executionMs, shouldFastTrack: true };
  }

  return { method: null, executionMs: null, shouldFastTrack: false };
}

// ===========================
// 2. QUALITY TREND TRACKING
// ===========================

export interface QualityMetrics {
  avg_word_count: number;
  snippet_rate: number;
  total_scrapes_tracked: number;
  last_updated: string;
}

/**
 * Computes updated rolling quality metrics after a successful scrape.
 * Uses exponential moving average (EMA) with alpha=0.3 for responsiveness.
 */
export function computeUpdatedQualityMetrics(
  existingMetrics: QualityMetrics | null,
  newArticles: any[]
): QualityMetrics {
  const alpha = 0.3; // EMA smoothing factor
  const now = new Date().toISOString();

  if (!newArticles || newArticles.length === 0) {
    return existingMetrics || {
      avg_word_count: 0,
      snippet_rate: 0,
      total_scrapes_tracked: 0,
      last_updated: now,
    };
  }

  // Compute current batch metrics
  const wordCounts = newArticles.map(a => a.word_count || 0);
  const batchAvgWordCount = wordCounts.reduce((s, w) => s + w, 0) / wordCounts.length;
  const snippetCount = newArticles.filter(a => a.is_snippet === true).length;
  const batchSnippetRate = snippetCount / newArticles.length;

  if (!existingMetrics || !existingMetrics.total_scrapes_tracked) {
    // First scrape — seed the metrics
    return {
      avg_word_count: Math.round(batchAvgWordCount),
      snippet_rate: Math.round(batchSnippetRate * 100) / 100,
      total_scrapes_tracked: 1,
      last_updated: now,
    };
  }

  // EMA update
  return {
    avg_word_count: Math.round(
      alpha * batchAvgWordCount + (1 - alpha) * existingMetrics.avg_word_count
    ),
    snippet_rate: Math.round(
      (alpha * batchSnippetRate + (1 - alpha) * existingMetrics.snippet_rate) * 100
    ) / 100,
    total_scrapes_tracked: existingMetrics.total_scrapes_tracked + 1,
    last_updated: now,
  };
}

// =====================================
// 3. DOMAIN PROFILE AUTO-ENRICHMENT
// =====================================

export interface LearnedDomainSignals {
  hasRSS?: boolean;
  hasJsonLd?: boolean;
  bestMethod?: string;
  avgResponseMs?: number;
  lastEnriched?: string;
}

/**
 * Extracts learnable signals from a successful scrape result to enrich domain profiles.
 */
export function extractDomainSignals(
  method: string,
  executionMs: number | null,
  result: any
): LearnedDomainSignals {
  const signals: LearnedDomainSignals = {
    bestMethod: method,
    lastEnriched: new Date().toISOString(),
  };

  if (executionMs) {
    signals.avgResponseMs = executionMs;
  }

  // Infer RSS availability from method
  if (method === 'rss_discovery' || method === 'universal-scraper') {
    const metadata = result?.metadata || {};
    if (metadata.method === 'rss' || metadata.rss_url) {
      signals.hasRSS = true;
    }
  }

  // Infer JSON-LD from metadata
  if (result?.metadata?.hasJsonLd || result?.metadata?.structured_data) {
    signals.hasJsonLd = true;
  }

  return signals;
}

/**
 * Persists learned domain signals to the scraper_domain_profiles table.
 * Uses upsert with merge — never overwrites existing manual profiles.
 */
export async function persistDomainSignals(
  supabase: SupabaseClient,
  feedUrl: string,
  signals: LearnedDomainSignals
): Promise<void> {
  try {
    const hostname = new URL(feedUrl).hostname.replace(/^www\./, '');

    // Check for existing global profile
    const { data: existing } = await supabase
      .from('scraper_domain_profiles')
      .select('id, profile')
      .is('tenant_id', null)
      .is('topic_id', null)
      .eq('domain_key', hostname)
      .single();

    const learnedProfile = {
      scrapingStrategy: {
        preferred: signals.bestMethod === 'rss_discovery' ? 'rss' : 
                   signals.bestMethod === 'enhanced_html' ? 'html' : 'auto',
      },
      _learned: signals, // Store raw signals under a private key for reference
    };

    if (existing) {
      // Merge: existing profile values take priority over learned ones
      const existingProfile = existing.profile as Record<string, any> || {};
      const merged = {
        ...learnedProfile,
        ...existingProfile,
        _learned: { ...((existingProfile._learned as any) || {}), ...signals },
      };

      await supabase
        .from('scraper_domain_profiles')
        .update({ profile: merged, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      // Insert new learned profile
      await supabase
        .from('scraper_domain_profiles')
        .insert({
          domain_key: hostname,
          profile: learnedProfile,
        });
    }

    console.log(`📚 Domain profile enriched for ${hostname}: method=${signals.bestMethod}`);
  } catch (error) {
    // Non-critical — log and continue
    console.warn('⚠️ Domain profile enrichment failed (non-critical):', error);
  }
}

// ===========================
// COMBINED UPDATE HELPER
// ===========================

/**
 * Updates source with all Phase 1 metrics after a successful scrape.
 * Called alongside the existing updateSourcePerformance.
 */
export async function updatePhase1Metrics(
  supabase: SupabaseClient,
  sourceId: string,
  method: string,
  executionMs: number | null,
  articles: any[],
  existingQualityMetrics: any,
  feedUrl: string
): Promise<void> {
  try {
    // 1. Adaptive Strategy Memory + Quality Trend Tracking (single DB call)
    const updatedQuality = computeUpdatedQualityMetrics(existingQualityMetrics, articles);

    await supabase
      .from('content_sources')
      .update({
        last_successful_method: method,
        last_method_execution_ms: executionMs,
        quality_metrics: updatedQuality,
      })
      .eq('id', sourceId);

    console.log(`📊 Phase 1 metrics updated: method=${method}, quality_tracked=${updatedQuality.total_scrapes_tracked}`);

    // 2. Domain Profile Auto-Enrichment (separate, non-critical)
    const signals = extractDomainSignals(method, executionMs, { articles });
    await persistDomainSignals(supabase, feedUrl, signals);
  } catch (error) {
    console.warn('⚠️ Phase 1 metrics update failed (non-critical):', error);
  }
}
