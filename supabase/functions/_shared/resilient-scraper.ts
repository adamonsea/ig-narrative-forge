/**
 * Resilient Scraper with Circuit Breaker Integration and Enhanced Error Handling
 * Combines all resilience components for robust content scraping
 */

import { EnhancedScrapingStrategies } from './enhanced-scraping-strategies.ts';
import { DatabaseOperations } from './database-operations.ts';
import { CircuitBreakerManager } from './circuit-breaker.ts';
import { SourcePoolManager } from './source-pool-manager.ts';
import { ContentCacheManager } from './content-cache-manager.ts';
import { ScrapingResult } from './types.ts';

export interface ResilientScrapingOptions {
  useCache: boolean;
  maxCacheAge: number;
  fallbackToCache: boolean;
  retryFailedSources: boolean;
  healthCheckBeforeScraping: boolean;
}

export interface ResilientScrapingResult extends ScrapingResult {
  sourceInfo: {
    id: string;
    name: string;
    tier: string;
    healthScore: number;
  };
  cacheInfo: {
    used: boolean;
    stored: boolean;
    age?: number;
  };
  fallbacksUsed: string[];
  totalAttempts: number;
  responseTime: number;
}

export class ResilientScraper {
  private circuitBreaker: CircuitBreakerManager;
  private sourcePoolManager: SourcePoolManager;
  private contentCache: ContentCacheManager;
  private dbOps: DatabaseOperations;
  
  constructor(supabase: any) {
    this.circuitBreaker = new CircuitBreakerManager();
    this.sourcePoolManager = new SourcePoolManager(this.circuitBreaker);
    this.contentCache = new ContentCacheManager();
    this.dbOps = new DatabaseOperations(supabase);
  }

  /**
   * Execute resilient scraping with full error handling and fallbacks
   */
  async scrapeWithResilience(
    supabase: any,
    region?: string,
    topicId?: string,
    options: Partial<ResilientScrapingOptions> = {}
  ): Promise<ResilientScrapingResult | null> {
    
    const opts: ResilientScrapingOptions = {
      useCache: true,
      maxCacheAge: 2 * 60 * 60 * 1000, // 2 hours
      fallbackToCache: true,
      retryFailedSources: false,
      healthCheckBeforeScraping: true,
      ...options
    };

    const startTime = Date.now();
    let totalAttempts = 0;
    const fallbacksUsed: string[] = [];

    try {
      // Step 1: Select best available source
      const sourceSelection = await this.sourcePoolManager.selectSource(supabase, region, topicId);
      
      if (!sourceSelection) {
        console.warn('⚠️ No healthy sources available for scraping');
        
        // Try to use cached content as last resort
        if (opts.fallbackToCache) {
          const cacheResult = await this.tryGlobalCacheFallback(region, topicId);
          if (cacheResult) {
            return cacheResult;
          }
        }
        
        return null;
      }

      console.log(`🎯 Selected source: ${sourceSelection.source.source_name} (${sourceSelection.tier} tier)`);
      console.log(`📝 Selection reason: ${sourceSelection.selectionReason}`);

      // Step 2: Health check (if enabled)
      if (opts.healthCheckBeforeScraping) {
        const isHealthy = this.circuitBreaker.isSourceHealthy(sourceSelection.source.id);
        if (!isHealthy) {
          console.log(`❌ Source ${sourceSelection.source.id} failed health check`);
          fallbacksUsed.push('health_check_failed');
          
          // Try fallback sources
          for (const fallbackSource of sourceSelection.fallbackSources) {
            if (this.circuitBreaker.isSourceHealthy(fallbackSource.id)) {
              console.log(`🔄 Trying fallback source: ${fallbackSource.source_name}`);
              const fallbackResult = await this.scrapeSource(fallbackSource, opts, supabase, region, topicId);
              if (fallbackResult) {
                fallbackResult.fallbacksUsed.push('fallback_source_used');
                return fallbackResult;
              }
            }
          }
        }
      }

      // Step 3: Try primary source
      const result = await this.scrapeSource(sourceSelection.source, opts, supabase, region, topicId);
      
      if (result) {
        result.fallbacksUsed = fallbacksUsed;
        result.totalAttempts = totalAttempts + 1;
        result.responseTime = Date.now() - startTime;
        return result;
      }

      // Step 4: Try fallback sources if primary failed
      console.log('🔄 Primary source failed, trying fallbacks...');
      fallbacksUsed.push('primary_source_failed');
      
      for (const fallbackSource of sourceSelection.fallbackSources) {
        totalAttempts++;
        console.log(`🔄 Trying fallback source: ${fallbackSource.source_name}`);
        
        const fallbackResult = await this.scrapeSource(fallbackSource, opts, supabase, region, topicId);
        if (fallbackResult) {
          fallbackResult.fallbacksUsed = [...fallbacksUsed, 'fallback_source_success'];
          fallbackResult.totalAttempts = totalAttempts;
          fallbackResult.responseTime = Date.now() - startTime;
          return fallbackResult;
        }
      }

      // Step 5: Cache fallback as last resort
      if (opts.fallbackToCache) {
        console.log('🔄 All sources failed, trying cache fallback...');
        fallbacksUsed.push('all_sources_failed');
        
        const cacheResult = await this.tryGlobalCacheFallback(region, topicId);
        if (cacheResult) {
          cacheResult.fallbacksUsed = [...fallbacksUsed, 'cache_fallback_success'];
          cacheResult.totalAttempts = totalAttempts;
          cacheResult.responseTime = Date.now() - startTime;
          return cacheResult;
        }
      }

      console.error('❌ All scraping strategies and fallbacks failed');
      return null;

    } catch (error) {
      console.error('❌ Resilient scraping error:', error);
      
      // Log error for monitoring
      await this.dbOps.logSystemEvent(
        'error',
        `Resilient scraping failed: ${error.message}`,
        {
          region,
          topicId,
          fallbacksUsed,
          totalAttempts,
          error: error.message,
          stack: error.stack
        },
        'resilient-scraper'
      );

      return null;
    }
  }

  /**
   * Scrape from a specific source with circuit breaker protection
   */
  private async scrapeSource(
    source: any,
    options: ResilientScrapingOptions,
    supabase: any,
    region?: string,
    topicId?: string
  ): Promise<ResilientScrapingResult | null> {
    
    const sourceStartTime = Date.now();
    let cacheUsed = false;
    let cacheStored = false;
    let cacheAge: number | undefined;

    try {
      // Check cache first (if enabled)
      if (options.useCache) {
        const cachedArticles = this.contentCache.getCachedArticles(
          source.id,
          source.feed_url,
          options.maxCacheAge
        );
        
        if (cachedArticles && cachedArticles.length > 0) {
          console.log(`💾 Using cached content for ${source.source_name} (${cachedArticles.length} articles)`);
          cacheUsed = true;
          
          return {
            success: true,
            articles: cachedArticles,
            articlesFound: cachedArticles.length,
            articlesScraped: cachedArticles.length,
            errors: [],
            method: 'cache',
            sourceInfo: {
              id: source.id,
              name: source.source_name,
              tier: 'CACHED',
              healthScore: 100
            },
            cacheInfo: {
              used: true,
              stored: false,
              age: cacheAge
            },
            fallbacksUsed: ['cache_hit'],
            totalAttempts: 1,
            responseTime: Date.now() - sourceStartTime
          };
        }
      }

      // Execute scraping with circuit breaker protection
      const scrapingResult = await this.circuitBreaker.execute(source.id, async () => {
        const strategies = new EnhancedScrapingStrategies(region || 'general', source, source.feed_url);
        return await strategies.executeScrapingStrategy();
      });

      // Store in cache if successful
      if (scrapingResult.success && scrapingResult.articles.length > 0 && options.useCache) {
        this.contentCache.storeArticles(
          source.id,
          source.feed_url,
          scrapingResult.articles,
          scrapingResult.method
        );
        cacheStored = true;
      }

      // Store articles in database
      let storedCount = 0;
      let duplicateCount = 0;
      let discardedCount = 0;

      if (scrapingResult.success && scrapingResult.articles.length > 0) {
        const storageResult = await this.dbOps.storeArticles(
          scrapingResult.articles,
          source.id,
          region || 'general',
          topicId
        );
        
        storedCount = storageResult.stored;
        duplicateCount = storageResult.duplicates;
        discardedCount = storageResult.discarded;
      }

      // Update source metrics
      await this.dbOps.updateSourceMetrics(
        source.id,
        scrapingResult.success,
        scrapingResult.method,
        Date.now() - sourceStartTime
      );

      const healthScore = this.circuitBreaker.getCircuitBreaker(source.id).getHealthScore();

      return {
        ...scrapingResult,
        articles: scrapingResult.articles.slice(0, storedCount), // Only include stored articles
        articlesScraped: storedCount,
        sourceInfo: {
          id: source.id,
          name: source.source_name,
          tier: 'PRIMARY', // Will be overridden by caller
          healthScore
        },
        cacheInfo: {
          used: cacheUsed,
          stored: cacheStored,
          age: cacheAge
        },
        fallbacksUsed: [],
        totalAttempts: 1,
        responseTime: Date.now() - sourceStartTime
      };

    } catch (error) {
      console.error(`❌ Error scraping source ${source.source_name}: ${error.message}`);
      
      // Try cache fallback if enabled
      if (options.fallbackToCache && options.useCache) {
        const cachedArticles = this.contentCache.getCachedArticles(
          source.id,
          source.feed_url,
          24 * 60 * 60 * 1000 // 24 hour max age for emergency fallback
        );
        
        if (cachedArticles && cachedArticles.length > 0) {
          console.log(`🆘 Using stale cache for ${source.source_name} after error`);
          
          return {
            success: true,
            articles: cachedArticles,
            articlesFound: cachedArticles.length,
            articlesScraped: cachedArticles.length,
            errors: [error.message],
            method: 'stale_cache',
            sourceInfo: {
              id: source.id,
              name: source.source_name,
              tier: 'EMERGENCY',
              healthScore: 25
            },
            cacheInfo: {
              used: true,
              stored: false,
              age: cacheAge
            },
            fallbacksUsed: ['error_cache_fallback'],
            totalAttempts: 1,
            responseTime: Date.now() - sourceStartTime
          };
        }
      }

      return null;
    }
  }

  /**
   * Try to find any cached content for the region/topic
   */
  private async tryGlobalCacheFallback(
    region?: string,
    topicId?: string
  ): Promise<ResilientScrapingResult | null> {
    
    console.log('🔍 Searching for any cached content as emergency fallback...');
    
    // This is a simplified implementation - in a real system you'd want to
    // search through available cache entries more systematically
    const cacheStats = this.contentCache.getStatistics();
    
    if (cacheStats.totalEntries > 0) {
      console.log(`📦 Found ${cacheStats.totalEntries} cached entries, but global fallback not implemented yet`);
      // TODO: Implement global cache search logic
    }
    
    return null;
  }

  /**
   * Get comprehensive system health status
   */
  getSystemHealth(): {
    circuitBreakers: any;
    sourcePools: any;
    cache: any;
    recommendations: string[];
  } {
    const circuitStats = this.circuitBreaker.getStatistics();
    const poolStats = this.sourcePoolManager.getPoolStatistics();
    const cacheStats = this.contentCache.getStatistics();
    
    const recommendations: string[] = [];
    
    // Generate recommendations based on system state
    if (circuitStats.openCircuits > circuitStats.totalSources * 0.5) {
      recommendations.push('High number of failed sources - check network connectivity');
    }
    
    if (poolStats.totalHealthy < 3) {
      recommendations.push('Low number of healthy sources - consider adding more sources');
    }
    
    if (cacheStats.hitRate < 20) {
      recommendations.push('Low cache hit rate - consider increasing cache TTL');
    }
    
    if (cacheStats.expiredEntries > cacheStats.totalEntries * 0.3) {
      recommendations.push('High number of expired cache entries - running cleanup');
      this.contentCache.cleanup();
    }

    return {
      circuitBreakers: circuitStats,
      sourcePools: poolStats,
      cache: cacheStats,
      recommendations
    };
  }

  /**
   * Force refresh all system components
   */
  async refreshSystem(supabase: any, region?: string, topicId?: string): Promise<void> {
    console.log('🔄 Refreshing resilient scraping system...');
    
    // Refresh source pools
    await this.sourcePoolManager.forceRefresh(supabase, region, topicId);
    
    // Clean up cache
    this.contentCache.cleanup();
    
    // Reset circuit breakers for recovering sources
    const circuitStatuses = this.circuitBreaker.getAllSourcesStatus();
    for (const [sourceId, status] of Object.entries(circuitStatuses)) {
      if (status.state === 'HALF_OPEN' && status.failureRate < 50) {
        this.circuitBreaker.resetSource(sourceId);
        console.log(`🔄 Reset circuit breaker for improving source: ${sourceId}`);
      }
    }
    
    console.log('✅ System refresh completed');
  }
}