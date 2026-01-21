/**
 * Feed caching utility for instant content display
 * Implements stale-while-revalidate pattern with robust error handling
 * 
 * Design decisions:
 * - 15 min fresh TTL (shorter than widget's 30 min for news freshness)
 * - 24 hour usable stale period (show old content while loading)
 * - LRU eviction: max 5 topics cached
 * - Lightweight: only essential story fields stored
 */

const CACHE_VERSION = 1;
const FRESH_TTL_MS = 15 * 60 * 1000; // 15 minutes
const STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_TOPICS_CACHED = 5;
const MAX_STORIES_PER_TOPIC = 20;
const CACHE_KEY_PREFIX = 'feed_cache_';
const CACHE_INDEX_KEY = 'feed_cache_index';

export interface CachedSlide {
  id: string;
  slide_number: number;
  content: string;
  word_count: number;
  links?: Array<{ text: string; url: string }>;
}

export interface CachedStory {
  id: string;
  title: string;
  cover_illustration_url?: string;
  publication_name: string;
  created_at: string;
  slides: CachedSlide[];
  is_parliamentary?: boolean;
  article?: {
    source_url?: string;
    published_at?: string;
    region?: string;
  };
}

export interface CachedTopic {
  id: string;
  name: string;
  slug: string;
  topic_type: 'regional' | 'keyword';
  region?: string;
  branding_config?: {
    logo_url?: string;
    subheader?: string;
    show_topic_name?: boolean;
    icon_url?: string;
  };
  donation_enabled?: boolean;
  keywords?: string[];
  landmarks?: string[];
  organizations?: string[];
}

export interface FeedCacheEntry {
  version: number;
  timestamp: number;
  topicSlug: string;
  topic: CachedTopic;
  stories: CachedStory[];
}

interface CacheIndex {
  topics: Array<{ slug: string; timestamp: number }>;
}

/**
 * Get cache key for a topic
 */
const getCacheKey = (slug: string): string => `${CACHE_KEY_PREFIX}${slug.toLowerCase()}`;

/**
 * Get LRU cache index
 */
const getCacheIndex = (): CacheIndex => {
  try {
    const raw = localStorage.getItem(CACHE_INDEX_KEY);
    if (!raw) return { topics: [] };
    return JSON.parse(raw);
  } catch {
    return { topics: [] };
  }
};

/**
 * Update LRU cache index
 */
const updateCacheIndex = (slug: string): void => {
  try {
    const index = getCacheIndex();
    
    // Remove existing entry for this slug
    index.topics = index.topics.filter(t => t.slug !== slug.toLowerCase());
    
    // Add to front (most recent)
    index.topics.unshift({ slug: slug.toLowerCase(), timestamp: Date.now() });
    
    // Evict oldest if over limit
    while (index.topics.length > MAX_TOPICS_CACHED) {
      const oldest = index.topics.pop();
      if (oldest) {
        try {
          localStorage.removeItem(getCacheKey(oldest.slug));
        } catch {
          // Ignore removal errors
        }
      }
    }
    
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  } catch {
    // Silently fail - caching is non-critical
  }
};

/**
 * Check if cache entry is fresh (within TTL)
 */
export const isCacheFresh = (entry: FeedCacheEntry): boolean => {
  const age = Date.now() - entry.timestamp;
  return age < FRESH_TTL_MS;
};

/**
 * Check if cache entry is usable (within stale period)
 */
export const isCacheUsable = (entry: FeedCacheEntry): boolean => {
  const age = Date.now() - entry.timestamp;
  return age < STALE_MAX_AGE_MS && entry.version === CACHE_VERSION;
};

/**
 * Get cached feed data for a topic
 * Returns null if no cache or cache is too old
 */
export const getCachedFeed = (slug: string): FeedCacheEntry | null => {
  try {
    const key = getCacheKey(slug);
    const raw = localStorage.getItem(key);
    
    if (!raw) return null;
    
    const entry: FeedCacheEntry = JSON.parse(raw);
    
    // Validate structure
    if (
      !entry ||
      typeof entry.version !== 'number' ||
      typeof entry.timestamp !== 'number' ||
      !entry.topic ||
      !Array.isArray(entry.stories)
    ) {
      // Invalid cache, remove it
      localStorage.removeItem(key);
      return null;
    }
    
    // Check if usable
    if (!isCacheUsable(entry)) {
      localStorage.removeItem(key);
      return null;
    }
    
    return entry;
  } catch (error) {
    // Corrupted cache, ignore
    console.warn('Feed cache read error:', error);
    return null;
  }
};

/**
 * Transform full story to cached story (includes full slides for instant render)
 */
export const toCachedStory = (story: any): CachedStory => ({
  id: story.id,
  title: story.title,
  cover_illustration_url: story.cover_illustration_url,
  publication_name: story.publication_name || '',
  created_at: story.created_at,
  slides: (story.slides || []).map((slide: any) => ({
    id: slide.id,
    slide_number: slide.slide_number,
    content: slide.content || '',
    word_count: slide.word_count || 0,
    links: slide.links,
  })),
  is_parliamentary: story.is_parliamentary,
  article: story.article ? {
    source_url: story.article.source_url,
    published_at: story.article.published_at,
    region: story.article.region,
  } : undefined,
});

/**
 * Transform full topic to cached topic (includes keywords for filtering)
 */
export const toCachedTopic = (topic: any): CachedTopic => ({
  id: topic.id,
  name: topic.name,
  slug: topic.slug || '',
  topic_type: topic.topic_type,
  region: topic.region,
  branding_config: topic.branding_config,
  donation_enabled: topic.donation_enabled,
  keywords: topic.keywords || [],
  landmarks: topic.landmarks || [],
  organizations: topic.organizations || [],
});

/**
 * Set cached feed data for a topic
 */
export const setCachedFeed = (
  slug: string,
  topic: any,
  stories: any[]
): void => {
  try {
    const entry: FeedCacheEntry = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      topicSlug: slug.toLowerCase(),
      topic: toCachedTopic(topic),
      // Only cache stories with real slides (not placeholders)
      stories: stories
        .filter(story => story.slides?.length > 0 && 
          !story.slides[0]?.id?.startsWith('placeholder-'))
        .slice(0, MAX_STORIES_PER_TOPIC)
        .map(toCachedStory),
    };
    
    const key = getCacheKey(slug);
    localStorage.setItem(key, JSON.stringify(entry));
    
    // Update LRU index
    updateCacheIndex(slug);
  } catch (error) {
    // Handle QuotaExceededError - clear old caches
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('Feed cache quota exceeded, clearing old entries');
      clearOldestCache();
      
      // Retry once
      try {
        const entry: FeedCacheEntry = {
          version: CACHE_VERSION,
          timestamp: Date.now(),
          topicSlug: slug.toLowerCase(),
          topic: toCachedTopic(topic),
          stories: stories
            .filter(story => story.slides?.length > 0 && 
              !story.slides[0]?.id?.startsWith('placeholder-'))
            .slice(0, MAX_STORIES_PER_TOPIC)
            .map(toCachedStory),
        };
        localStorage.setItem(getCacheKey(slug), JSON.stringify(entry));
      } catch {
        // Give up - caching is non-critical
      }
    }
  }
};

/**
 * Clear the oldest cached topic
 */
const clearOldestCache = (): void => {
  try {
    const index = getCacheIndex();
    if (index.topics.length === 0) return;
    
    // Remove oldest
    const oldest = index.topics.pop();
    if (oldest) {
      localStorage.removeItem(getCacheKey(oldest.slug));
      localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
    }
  } catch {
    // Ignore
  }
};

/**
 * Clear all feed caches (useful for logout or version bump)
 */
export const clearAllFeedCaches = (): void => {
  try {
    const index = getCacheIndex();
    index.topics.forEach(t => {
      try {
        localStorage.removeItem(getCacheKey(t.slug));
      } catch {
        // Ignore
      }
    });
    localStorage.removeItem(CACHE_INDEX_KEY);
  } catch {
    // Ignore
  }
};

/**
 * Get cache age in human-readable format (for debugging/UI)
 */
export const getCacheAge = (entry: FeedCacheEntry): string => {
  const ageMs = Date.now() - entry.timestamp;
  const minutes = Math.floor(ageMs / 60000);
  
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} mins ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
};
