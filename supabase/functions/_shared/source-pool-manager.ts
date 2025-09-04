/**
 * Enhanced Source Management with Health-Based Pools and Dynamic Routing
 * Organizes sources by reliability and routes requests based on health metrics
 */

import { CircuitBreakerManager } from './circuit-breaker.ts';

export type SourceTier = 'PRIMARY' | 'SECONDARY' | 'EMERGENCY';
export type SourceHealth = 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'RECOVERING';

export interface SourceInfo {
  id: string;
  source_name: string;
  feed_url: string;
  source_type: 'hyperlocal' | 'regional' | 'national';
  credibility_score: number;
  success_rate: number;
  avg_response_time_ms: number;
  articles_scraped: number;
  last_scraped_at: string;
  is_active: boolean;
  region?: string;
  topic_id?: string;
}

export interface SourcePool {
  tier: SourceTier;
  sources: SourceInfo[];
  healthScore: number;
  lastUpdated: number;
}

export interface SourceSelectionResult {
  source: SourceInfo;
  tier: SourceTier;
  fallbackSources: SourceInfo[];
  selectionReason: string;
}

export class SourcePoolManager {
  private circuitBreaker: CircuitBreakerManager;
  private pools: Map<SourceTier, SourceInfo[]> = new Map();
  private sourceHealthCache: Map<string, SourceHealth> = new Map();
  private lastPoolUpdate = 0;
  private readonly POOL_UPDATE_INTERVAL = 300000; // 5 minutes

  constructor(circuitBreakerManager?: CircuitBreakerManager) {
    this.circuitBreaker = circuitBreakerManager || new CircuitBreakerManager();
    
    // Initialize empty pools
    this.pools.set('PRIMARY', []);
    this.pools.set('SECONDARY', []);  
    this.pools.set('EMERGENCY', []);
  }

  /**
   * Update source pools with fresh data from database
   */
  async updateSourcePools(supabase: any, region?: string, topicId?: string): Promise<void> {
    const now = Date.now();
    
    // Skip update if pools were recently updated
    if (now - this.lastPoolUpdate < this.POOL_UPDATE_INTERVAL / 2) {
      return;
    }

    console.log('🔄 Updating source pools...');

    try {
      // Build query with filters
      let query = supabase
        .from('content_sources')
        .select('*')
        .eq('is_active', true);

      if (region) {
        query = query.eq('region', region);
      }

      if (topicId) {
        query = query.eq('topic_id', topicId);
      }

      const { data: sources, error } = await query;

      if (error) {
        console.error('❌ Error fetching sources for pools:', error);
        return;
      }

      if (!sources || sources.length === 0) {
        console.warn('⚠️ No active sources found for pool update');
        return;
      }

      // Classify sources into tiers
      await this.classifySourcesIntoTiers(sources);
      this.lastPoolUpdate = now;
      
      console.log(`✅ Source pools updated with ${sources.length} sources`);
      this.logPoolStatistics();

    } catch (error) {
      console.error('❌ Error updating source pools:', error);
    }
  }

  /**
   * Classify sources into tiers based on performance metrics
   */
  private async classifySourcesIntoTiers(sources: SourceInfo[]): Promise<void> {
    // Clear existing pools
    this.pools.set('PRIMARY', []);
    this.pools.set('SECONDARY', []);
    this.pools.set('EMERGENCY', []);

    for (const source of sources) {
      const health = this.calculateSourceHealth(source);
      this.sourceHealthCache.set(source.id, health);

      const tier = this.determineSourceTier(source, health);
      
      const currentPool = this.pools.get(tier) || [];
      currentPool.push(source);
      this.pools.set(tier, currentPool);
    }

    // Sort each pool by quality score (descending)
    for (const [tier, pool] of this.pools) {
      pool.sort((a, b) => this.getSourceQualityScore(b) - this.getSourceQualityScore(a));
      this.pools.set(tier, pool);
    }
  }

  /**
   * Calculate source health status
   */
  private calculateSourceHealth(source: SourceInfo): SourceHealth {
    const circuitStatus = this.circuitBreaker.getAllSourcesStatus()[source.id];
    
    // If circuit breaker is managing this source, use its status
    if (circuitStatus) {
      if (circuitStatus.state === 'OPEN') return 'FAILED';
      if (circuitStatus.state === 'HALF_OPEN') return 'RECOVERING';
    }

    // Calculate health based on metrics
    const successRate = source.success_rate || 0;
    const responseTime = source.avg_response_time_ms || 0;
    const isRecent = this.isRecentlyActive(source.last_scraped_at);

    if (successRate >= 80 && responseTime < 10000 && isRecent) {
      return 'HEALTHY';
    } else if (successRate >= 50 && responseTime < 20000 && isRecent) {
      return 'DEGRADED';
    } else {
      return 'FAILED';
    }
  }

  /**
   * Determine appropriate tier for source
   */
  private determineSourceTier(source: SourceInfo, health: SourceHealth): SourceTier {
    const qualityScore = this.getSourceQualityScore(source);
    
    // Primary tier: High quality, healthy sources
    if (health === 'HEALTHY' && qualityScore >= 80 && source.success_rate >= 75) {
      return 'PRIMARY';
    }
    
    // Secondary tier: Decent quality sources or recovering sources
    if ((health === 'HEALTHY' && qualityScore >= 60) || 
        (health === 'DEGRADED' && qualityScore >= 70) ||
        health === 'RECOVERING') {
      return 'SECONDARY';
    }
    
    // Emergency tier: Everything else that's still active
    return 'EMERGENCY';
  }

  /**
   * Calculate composite quality score for source
   */
  private getSourceQualityScore(source: SourceInfo): number {
    const credibilityWeight = 0.3;
    const successRateWeight = 0.4;
    const responseTimeWeight = 0.2;
    const recencyWeight = 0.1;

    const credibilityScore = source.credibility_score || 50;
    const successRate = source.success_rate || 0;
    const responseTimeScore = Math.max(0, 100 - ((source.avg_response_time_ms || 10000) / 100));
    const recencyScore = this.isRecentlyActive(source.last_scraped_at) ? 100 : 50;

    return (
      credibilityScore * credibilityWeight +
      successRate * successRateWeight +
      responseTimeScore * responseTimeWeight +
      recencyScore * recencyWeight
    );
  }

  /**
   * Check if source was recently active
   */
  private isRecentlyActive(lastScrapedAt?: string): boolean {
    if (!lastScrapedAt) return false;
    
    const lastScraped = new Date(lastScrapedAt).getTime();
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    return lastScraped > dayAgo;
  }

  /**
   * Select best available source with intelligent fallback
   */
  async selectSource(
    supabase: any,
    region?: string,
    topicId?: string,
    preferredTier?: SourceTier
  ): Promise<SourceSelectionResult | null> {
    
    // Update pools if needed
    await this.updateSourcePools(supabase, region, topicId);

    // Try preferred tier first, then fallback through tiers
    const tierOrder: SourceTier[] = preferredTier 
      ? [preferredTier, ...(['PRIMARY', 'SECONDARY', 'EMERGENCY'].filter(t => t !== preferredTier) as SourceTier[])]
      : ['PRIMARY', 'SECONDARY', 'EMERGENCY'];

    for (const tier of tierOrder) {
      const pool = this.pools.get(tier) || [];
      const healthySources = pool.filter(source => 
        this.circuitBreaker.isSourceHealthy(source.id) &&
        this.sourceHealthCache.get(source.id) !== 'FAILED'
      );

      if (healthySources.length > 0) {
        const selected = healthySources[0]; // Already sorted by quality
        const fallbacks = healthySources.slice(1, 4); // Up to 3 fallback sources

        return {
          source: selected,
          tier,
          fallbackSources: fallbacks,
          selectionReason: `Selected from ${tier} tier (health: ${this.sourceHealthCache.get(selected.id)}, quality: ${Math.round(this.getSourceQualityScore(selected))})`
        };
      }
    }

    console.warn('⚠️ No healthy sources available in any tier');
    return null;
  }

  /**
   * Get sources by tier with health information
   */
  getSourcesByTier(tier: SourceTier): Array<SourceInfo & { health: SourceHealth; qualityScore: number }> {
    const pool = this.pools.get(tier) || [];
    
    return pool.map(source => ({
      ...source,
      health: this.sourceHealthCache.get(source.id) || 'FAILED',
      qualityScore: Math.round(this.getSourceQualityScore(source))
    }));
  }

  /**
   * Get pool statistics
   */
  getPoolStatistics(): {
    pools: Record<SourceTier, { count: number; healthyCount: number; avgQuality: number }>;
    totalSources: number;
    totalHealthy: number;
    lastUpdated: number;
  } {
    const stats: Record<SourceTier, { count: number; healthyCount: number; avgQuality: number }> = {
      PRIMARY: { count: 0, healthyCount: 0, avgQuality: 0 },
      SECONDARY: { count: 0, healthyCount: 0, avgQuality: 0 },
      EMERGENCY: { count: 0, healthyCount: 0, avgQuality: 0 }
    };

    let totalSources = 0;
    let totalHealthy = 0;

    for (const [tier, pool] of this.pools) {
      const healthySources = pool.filter(source => 
        this.sourceHealthCache.get(source.id) !== 'FAILED' &&
        this.circuitBreaker.isSourceHealthy(source.id)
      );

      const avgQuality = pool.length > 0
        ? Math.round(pool.reduce((sum, source) => sum + this.getSourceQualityScore(source), 0) / pool.length)
        : 0;

      stats[tier] = {
        count: pool.length,
        healthyCount: healthySources.length,
        avgQuality
      };

      totalSources += pool.length;
      totalHealthy += healthySources.length;
    }

    return {
      pools: stats,
      totalSources,
      totalHealthy,
      lastUpdated: this.lastPoolUpdate
    };
  }

  /**
   * Force refresh of source pools
   */
  async forceRefresh(supabase: any, region?: string, topicId?: string): Promise<void> {
    this.lastPoolUpdate = 0; // Force update
    await this.updateSourcePools(supabase, region, topicId);
  }

  /**
   * Get recommended scraping order for sources
   */
  getScrapingOrder(): SourceInfo[] {
    const allSources: SourceInfo[] = [];
    
    // Add sources in tier order: PRIMARY -> SECONDARY -> EMERGENCY
    for (const tier of ['PRIMARY', 'SECONDARY', 'EMERGENCY'] as SourceTier[]) {
      const pool = this.pools.get(tier) || [];
      const healthySources = pool.filter(source => 
        this.circuitBreaker.isSourceHealthy(source.id) &&
        this.sourceHealthCache.get(source.id) !== 'FAILED'
      );
      allSources.push(...healthySources);
    }

    return allSources;
  }

  /**
   * Log pool statistics for monitoring
   */
  private logPoolStatistics(): void {
    const stats = this.getPoolStatistics();
    
    console.log('📊 Source Pool Statistics:');
    console.log(`   PRIMARY: ${stats.pools.PRIMARY.healthyCount}/${stats.pools.PRIMARY.count} healthy (avg quality: ${stats.pools.PRIMARY.avgQuality})`);
    console.log(`   SECONDARY: ${stats.pools.SECONDARY.healthyCount}/${stats.pools.SECONDARY.count} healthy (avg quality: ${stats.pools.SECONDARY.avgQuality})`);
    console.log(`   EMERGENCY: ${stats.pools.EMERGENCY.healthyCount}/${stats.pools.EMERGENCY.count} healthy (avg quality: ${stats.pools.EMERGENCY.avgQuality})`);
    console.log(`   TOTAL: ${stats.totalHealthy}/${stats.totalSources} sources available`);
  }

  /**
   * Mark source as temporarily failed
   */
  markSourceFailed(sourceId: string): void {
    this.sourceHealthCache.set(sourceId, 'FAILED');
    console.log(`❌ Source ${sourceId} marked as failed`);
  }

  /**
   * Mark source as recovering
   */
  markSourceRecovering(sourceId: string): void {
    this.sourceHealthCache.set(sourceId, 'RECOVERING');
    console.log(`🔄 Source ${sourceId} marked as recovering`);
  }
}