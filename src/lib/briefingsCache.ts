/**
 * Briefings caching utility for instant briefings display
 * Implements idle-time prefetching to preload briefings after main feed loads
 * 
 * Design decisions:
 * - 30 min fresh TTL (briefings change less frequently than feed)
 * - 24 hour usable stale period
 * - Prefetch triggered via requestIdleCallback for background loading
 * - Lightweight: only essential roundup fields stored
 */

import { supabase } from '@/integrations/supabase/client';

const CACHE_VERSION = 1;
const FRESH_TTL_MS = 30 * 60 * 1000; // 30 minutes
const STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY_PREFIX = 'briefings_cache_';

export interface CachedRoundup {
  id: string;
  roundup_type: 'daily' | 'weekly';
  period_start: string;
  period_end: string;
  story_ids: string[];
  stats?: any;
}

export interface BriefingsCacheEntry {
  version: number;
  timestamp: number;
  topicSlug: string;
  topicId: string;
  dailyRoundups: CachedRoundup[];
  weeklyRoundups: CachedRoundup[];
}

/**
 * Get cache key for a topic
 */
const getCacheKey = (slug: string): string => `${CACHE_KEY_PREFIX}${slug.toLowerCase()}`;

/**
 * Check if cache entry is fresh (within TTL)
 */
export const isBriefingsCacheFresh = (entry: BriefingsCacheEntry): boolean => {
  const age = Date.now() - entry.timestamp;
  return age < FRESH_TTL_MS;
};

/**
 * Check if cache entry is usable (within stale period)
 */
export const isBriefingsCacheUsable = (entry: BriefingsCacheEntry): boolean => {
  const age = Date.now() - entry.timestamp;
  return age < STALE_MAX_AGE_MS && entry.version === CACHE_VERSION;
};

/**
 * Get cached briefings data for a topic
 * Returns null if no cache or cache is too old
 */
export const getCachedBriefings = (slug: string): BriefingsCacheEntry | null => {
  try {
    const key = getCacheKey(slug);
    const raw = localStorage.getItem(key);
    
    if (!raw) return null;
    
    const entry: BriefingsCacheEntry = JSON.parse(raw);
    
    // Validate structure
    if (
      !entry ||
      typeof entry.version !== 'number' ||
      typeof entry.timestamp !== 'number' ||
      !entry.topicId ||
      !Array.isArray(entry.dailyRoundups) ||
      !Array.isArray(entry.weeklyRoundups)
    ) {
      // Invalid cache, remove it
      localStorage.removeItem(key);
      return null;
    }
    
    // Check if usable
    if (!isBriefingsCacheUsable(entry)) {
      localStorage.removeItem(key);
      return null;
    }
    
    return entry;
  } catch (error) {
    console.warn('Briefings cache read error:', error);
    return null;
  }
};

/**
 * Set cached briefings data for a topic
 */
export const setCachedBriefings = (
  slug: string,
  topicId: string,
  dailyRoundups: CachedRoundup[],
  weeklyRoundups: CachedRoundup[]
): void => {
  try {
    const entry: BriefingsCacheEntry = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      topicSlug: slug.toLowerCase(),
      topicId,
      dailyRoundups: dailyRoundups.slice(0, 30), // Keep last 30 daily
      weeklyRoundups: weeklyRoundups.slice(0, 12), // Keep last 12 weekly
    };
    
    const key = getCacheKey(slug);
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    // Handle QuotaExceededError silently - caching is non-critical
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('Briefings cache quota exceeded');
    }
  }
};

/**
 * Prefetch briefings for a topic in the background
 * Uses requestIdleCallback for non-blocking operation
 */
export const prefetchBriefings = (slug: string, topicId: string): void => {
  // Check if we already have fresh cache
  const existing = getCachedBriefings(slug);
  if (existing && isBriefingsCacheFresh(existing)) {
    console.log(`📋 Briefings cache fresh for ${slug}, skipping prefetch`);
    return;
  }

  // Use requestIdleCallback for background loading, fallback to setTimeout
  const scheduleTask = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 100));
  
  scheduleTask(async () => {
    try {
      console.log(`📋 Prefetching briefings for ${slug}...`);
      
      // Fetch daily and weekly roundups in parallel
      const [dailyResult, weeklyResult] = await Promise.all([
        supabase
          .from('topic_roundups')
          .select('id, roundup_type, period_start, period_end, story_ids, stats')
          .eq('topic_id', topicId)
          .eq('roundup_type', 'daily')
          .eq('is_published', true)
          .order('period_start', { ascending: false })
          .limit(30),
        supabase
          .from('topic_roundups')
          .select('id, roundup_type, period_start, period_end, story_ids, stats')
          .eq('topic_id', topicId)
          .eq('roundup_type', 'weekly')
          .eq('is_published', true)
          .order('period_start', { ascending: false })
          .limit(12),
      ]);

      const dailyRoundups = (dailyResult.data || []) as CachedRoundup[];
      const weeklyRoundups = (weeklyResult.data || []) as CachedRoundup[];

      if (dailyRoundups.length > 0 || weeklyRoundups.length > 0) {
        setCachedBriefings(slug, topicId, dailyRoundups, weeklyRoundups);
        console.log(`✅ Briefings cached: ${dailyRoundups.length} daily, ${weeklyRoundups.length} weekly`);
      }
    } catch (error) {
      console.warn('Briefings prefetch error:', error);
    }
  });
};

/**
 * Clear briefings cache for a topic
 */
export const clearBriefingsCache = (slug: string): void => {
  try {
    localStorage.removeItem(getCacheKey(slug));
  } catch {
    // Ignore
  }
};
