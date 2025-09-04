/**
 * Content Caching System for Resilient Scraping Operations
 * Caches successful content to provide fallback during outages
 */

export interface CacheEntry {
  key: string;
  content: any;
  metadata: {
    sourceId: string;
    url: string;
    timestamp: number;
    expiryTime: number;
    contentType: 'article' | 'rss_feed' | 'html_page';
    quality: number;
    size: number;
  };
}

export interface CacheStatistics {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  oldestEntry: number;
  newestEntry: number;
  expiredEntries: number;
}

export class ContentCacheManager {
  private cache = new Map<string, CacheEntry>();
  private accessLog = new Map<string, number>();
  private hitCount = 0;
  private missCount = 0;
  private readonly maxCacheSize: number;
  private readonly defaultTTL: number;

  constructor(
    maxCacheSize: number = 1000, // Max number of entries
    defaultTTL: number = 24 * 60 * 60 * 1000 // 24 hours default TTL
  ) {
    this.maxCacheSize = maxCacheSize;
    this.defaultTTL = defaultTTL;

    // Periodic cleanup
    setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000); // Cleanup every hour
  }

  /**
   * Store content in cache
   */
  store(
    key: string,
    content: any,
    metadata: {
      sourceId: string;
      url: string;
      contentType: 'article' | 'rss_feed' | 'html_page';
      quality?: number;
    },
    ttl?: number
  ): boolean {
    try {
      const now = Date.now();
      const actualTTL = ttl || this.getTTLByContentType(metadata.contentType);
      const serializedContent = JSON.stringify(content);
      
      const entry: CacheEntry = {
        key,
        content,
        metadata: {
          ...metadata,
          timestamp: now,
          expiryTime: now + actualTTL,
          quality: metadata.quality || 50,
          size: serializedContent.length
        }
      };

      // Check if we need to make space
      if (this.cache.size >= this.maxCacheSize) {
        this.evictOldest();
      }

      this.cache.set(key, entry);
      console.log(`💾 Cached content: ${key} (${entry.metadata.contentType}, ${this.formatSize(entry.metadata.size)})`);
      
      return true;
    } catch (error) {
      console.error(`❌ Error storing cache entry ${key}:`, error);
      return false;
    }
  }

  /**
   * Retrieve content from cache
   */
  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.missCount++;
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.missCount++;
      console.log(`⏰ Cache entry expired: ${key}`);
      return null;
    }

    // Update access log
    this.accessLog.set(key, Date.now());
    this.hitCount++;
    
    console.log(`💾 Cache hit: ${key} (age: ${this.formatAge(entry.metadata.timestamp)})`);
    return entry;
  }

  /**
   * Get content if available and fresh
   */
  getFreshContent(key: string, maxAge?: number): any | null {
    const entry = this.get(key);
    
    if (!entry) return null;

    // Check if content is fresh enough
    if (maxAge && (Date.now() - entry.metadata.timestamp) > maxAge) {
      console.log(`📅 Cache entry too old: ${key} (${this.formatAge(entry.metadata.timestamp)} > ${this.formatDuration(maxAge)})`);
      return null;
    }

    return entry.content;
  }

  /**
   * Store scraped articles with automatic key generation
   */
  storeArticles(
    sourceId: string, 
    url: string, 
    articles: any[], 
    scrapingMethod: string
  ): string {
    const key = this.generateArticleKey(sourceId, url);
    const quality = this.calculateArticleQuality(articles);
    
    const success = this.store(key, {
      articles,
      scrapingMethod,
      articleCount: articles.length,
      scrapedAt: Date.now()
    }, {
      sourceId,
      url,
      contentType: 'article',
      quality
    });

    if (success) {
      console.log(`📰 Cached ${articles.length} articles from ${url} (quality: ${quality})`);
    }

    return key;
  }

  /**
   * Store RSS feed content
   */
  storeRSSFeed(sourceId: string, feedUrl: string, rawContent: string): string {
    const key = this.generateRSSKey(sourceId, feedUrl);
    
    const success = this.store(key, {
      rawContent,
      feedUrl,
      contentLength: rawContent.length,
      itemCount: this.countRSSItems(rawContent)
    }, {
      sourceId,
      url: feedUrl,
      contentType: 'rss_feed',
      quality: rawContent.length > 1000 ? 80 : 50
    }, 2 * 60 * 60 * 1000); // RSS feeds: 2 hour TTL

    if (success) {
      console.log(`📡 Cached RSS feed: ${feedUrl} (${this.formatSize(rawContent.length)})`);
    }

    return key;
  }

  /**
   * Store HTML page content
   */
  storeHTMLPage(sourceId: string, url: string, htmlContent: string): string {
    const key = this.generateHTMLKey(sourceId, url);
    
    const success = this.store(key, {
      htmlContent,
      url,
      contentLength: htmlContent.length,
      cachedAt: Date.now()
    }, {
      sourceId,
      url,
      contentType: 'html_page',
      quality: htmlContent.length > 5000 ? 70 : 40
    }, 60 * 60 * 1000); // HTML pages: 1 hour TTL

    return key;
  }

  /**
   * Get cached articles
   */
  getCachedArticles(sourceId: string, url: string, maxAge?: number): any[] | null {
    const key = this.generateArticleKey(sourceId, url);
    const cached = this.getFreshContent(key, maxAge);
    return cached?.articles || null;
  }

  /**
   * Get cached RSS feed
   */
  getCachedRSSFeed(sourceId: string, feedUrl: string, maxAge?: number): string | null {
    const key = this.generateRSSKey(sourceId, feedUrl);
    const cached = this.getFreshContent(key, maxAge);
    return cached?.rawContent || null;
  }

  /**
   * Get cached HTML page
   */
  getCachedHTMLPage(sourceId: string, url: string, maxAge?: number): string | null {
    const key = this.generateHTMLKey(sourceId, url);
    const cached = this.getFreshContent(key, maxAge);
    return cached?.htmlContent || null;
  }

  /**
   * Invalidate cache entries for a source
   */
  invalidateSource(sourceId: string): number {
    let invalidatedCount = 0;
    
    for (const [key, entry] of this.cache) {
      if (entry.metadata.sourceId === sourceId) {
        this.cache.delete(key);
        invalidatedCount++;
      }
    }

    console.log(`🗑️ Invalidated ${invalidatedCount} cache entries for source ${sourceId}`);
    return invalidatedCount;
  }

  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    const entries = Array.from(this.cache.values());
    const now = Date.now();
    
    const totalSize = entries.reduce((sum, entry) => sum + entry.metadata.size, 0);
    const expiredEntries = entries.filter(entry => this.isExpired(entry)).length;
    const timestamps = entries.map(entry => entry.metadata.timestamp);
    
    return {
      totalEntries: entries.length,
      totalSize,
      hitRate: this.getTotalRequests() > 0 ? (this.hitCount / this.getTotalRequests()) * 100 : 0,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : now,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : now,
      expiredEntries
    };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const entryCount = this.cache.size;
    this.cache.clear();
    this.accessLog.clear();
    this.hitCount = 0;
    this.missCount = 0;
    console.log(`🗑️ Cache cleared: ${entryCount} entries removed`);
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    const beforeCount = this.cache.size;
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.accessLog.delete(key);
    }

    const cleanedCount = expiredKeys.length;
    if (cleanedCount > 0) {
      console.log(`🧹 Cache cleanup: removed ${cleanedCount} expired entries`);
    }

    return cleanedCount;
  }

  // Private helper methods

  private generateArticleKey(sourceId: string, url: string): string {
    return `articles:${sourceId}:${this.hashUrl(url)}`;
  }

  private generateRSSKey(sourceId: string, feedUrl: string): string {
    return `rss:${sourceId}:${this.hashUrl(feedUrl)}`;
  }

  private generateHTMLKey(sourceId: string, url: string): string {
    return `html:${sourceId}:${this.hashUrl(url)}`;
  }

  private hashUrl(url: string): string {
    // Simple hash function for URL
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.metadata.expiryTime;
  }

  private getTTLByContentType(contentType: string): number {
    switch (contentType) {
      case 'article':
        return 24 * 60 * 60 * 1000; // 24 hours
      case 'rss_feed':
        return 2 * 60 * 60 * 1000; // 2 hours
      case 'html_page':
        return 60 * 60 * 1000; // 1 hour
      default:
        return this.defaultTTL;
    }
  }

  private calculateArticleQuality(articles: any[]): number {
    if (!articles || articles.length === 0) return 0;
    
    const avgWordCount = articles.reduce((sum, article) => 
      sum + (article.word_count || 0), 0) / articles.length;
    
    if (avgWordCount > 500) return 90;
    if (avgWordCount > 200) return 70;
    if (avgWordCount > 100) return 50;
    return 30;
  }

  private countRSSItems(rssContent: string): number {
    const itemMatches = rssContent.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi);
    return itemMatches ? itemMatches.length : 0;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    // Find least recently accessed entry
    for (const [key, entry] of this.cache) {
      const lastAccess = this.accessLog.get(key) || entry.metadata.timestamp;
      if (lastAccess < oldestTime) {
        oldestTime = lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessLog.delete(oldestKey);
      console.log(`🗑️ Evicted oldest cache entry: ${oldestKey}`);
    }
  }

  private getTotalRequests(): number {
    return this.hitCount + this.missCount;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  }

  private formatAge(timestamp: number): string {
    const ageMs = Date.now() - timestamp;
    return this.formatDuration(ageMs);
  }

  private formatDuration(ms: number): string {
    const minutes = Math.floor(ms / (60 * 1000));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }
}