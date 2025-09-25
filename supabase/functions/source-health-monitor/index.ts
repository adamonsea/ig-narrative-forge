import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { EnhancedRetryStrategies } from '../_shared/enhanced-retry-strategies.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SourceHealthMetrics {
  sourceId: string;
  sourceName: string;
  isHealthy: boolean;
  successRate: number;
  avgResponseTime: number;
  lastError?: string;
  recommendedAction: 'none' | 'monitor' | 'method_change' | 'deactivate' | 'investigate';
  alternativeMethod?: string;
  healthScore: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const retryStrategy = new EnhancedRetryStrategies();

    console.log('🏥 Starting source health monitoring...');

    // Get all active sources for monitoring
    const { data: sources, error: sourcesError } = await supabase
      .from('content_sources')
      .select('*')
      .eq('is_active', true)
      .order('last_scraped_at', { ascending: true, nullsFirst: true });

    if (sourcesError) {
      throw sourcesError;
    }

    const healthMetrics: SourceHealthMetrics[] = [];
    let sourcesProcessed = 0;
    let sourcesDeactivated = 0;
    let methodsChanged = 0;

    for (const source of sources || []) {
      try {
        console.log(`🔍 Analyzing health for: ${source.source_name}`);
        
        const metrics = await analyzeSourceHealth(supabase, source, retryStrategy);
        healthMetrics.push(metrics);
        
        // Take action based on health analysis
        if (metrics.recommendedAction === 'deactivate') {
          await supabase
            .from('content_sources')
            .update({ 
              is_active: false,
              last_error: `Auto-deactivated: ${metrics.lastError || 'Consistently failing'}`,
              updated_at: new Date().toISOString()
            })
            .eq('id', source.id);
            
          console.log(`🚫 Deactivated failing source: ${source.source_name}`);
          sourcesDeactivated++;
          
        } else if (metrics.recommendedAction === 'method_change' && metrics.alternativeMethod) {
          await supabase
            .from('content_sources')
            .update({ 
              scraping_method: metrics.alternativeMethod,
              updated_at: new Date().toISOString()
            })
            .eq('id', source.id);
            
          console.log(`🔄 Changed gathering method for ${source.source_name} to ${metrics.alternativeMethod}`);
          methodsChanged++;
        }
        
        sourcesProcessed++;
        
      } catch (error) {
        console.error(`❌ Error analyzing source ${source.source_name}:`, error);
        
        healthMetrics.push({
          sourceId: source.id,
          sourceName: source.source_name,
          isHealthy: false,
          successRate: 0,
          avgResponseTime: 0,
          lastError: error instanceof Error ? error.message : String(error),
          recommendedAction: 'investigate',
          healthScore: 0
        });
      }
    }

    // Log summary to system logs
    await supabase.from('system_logs').insert({
      level: 'info',
      message: `Source health monitoring completed`,
      context: {
        sources_processed: sourcesProcessed,
        sources_deactivated: sourcesDeactivated,
        methods_changed: methodsChanged,
        healthy_sources: healthMetrics.filter(m => m.isHealthy).length,
        unhealthy_sources: healthMetrics.filter(m => !m.isHealthy).length,
        avg_health_score: healthMetrics.length > 0 
          ? healthMetrics.reduce((sum, m) => sum + m.healthScore, 0) / healthMetrics.length 
          : 0
      },
      function_name: 'source-health-monitor'
    });

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          sources_processed: sourcesProcessed,
          sources_deactivated: sourcesDeactivated,
          methods_changed: methodsChanged,
          healthy_sources: healthMetrics.filter(m => m.isHealthy).length,
          unhealthy_sources: healthMetrics.filter(m => !m.isHealthy).length
        },
        health_metrics: healthMetrics
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Source health monitoring error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function analyzeSourceHealth(
  supabase: any, 
  source: any, 
  retryStrategy: EnhancedRetryStrategies
): Promise<SourceHealthMetrics> {
  
  // Quick accessibility check
  const accessCheck = await retryStrategy.quickAccessibilityCheck(source.feed_url);
  
  // Get ACTUAL article counts from database instead of potentially stale cached values
  const { count: actualArticleCount } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', source.id);
    
  const { count: topicArticleCount } = await supabase
    .from('topic_articles')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', source.id);
  
  const totalArticlesStored = (actualArticleCount || 0) + (topicArticleCount || 0);
  
  // Calculate health score (0-100) with heavy emphasis on actual content storage
  let healthScore = 0;
  const successRate = source.success_rate || 0;
  
  // Accessibility check (20 points max)
  if (accessCheck.accessible) {
    healthScore += 20;
  }
  
  // CRITICAL: Actual content storage is the most important factor (50 points max)
  if (totalArticlesStored >= 5 && successRate >= 80) {
    healthScore += 50; // Productive source
  } else if (totalArticlesStored >= 3 && successRate >= 50) {
    healthScore += 35; // Active source
  } else if (totalArticlesStored > 0 && successRate > 0) {
    healthScore += 20; // Some success
  } else if (successRate >= 70 && totalArticlesStored === 0) {
    healthScore += 15; // Filtered but connected
  }
  // No points for sources that never store articles
  
  // Response time bonus (10 points max)
  if (source.avg_response_time_ms && source.avg_response_time_ms < 10000) {
    healthScore += 10;
  }
  
  // Recent activity bonus (20 points max)
  if (source.last_scraped_at) {
    const daysSinceLastScrape = (Date.now() - new Date(source.last_scraped_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastScrape < 1) {
      healthScore += 20;
    } else if (daysSinceLastScrape < 7) {
      healthScore += 10;
    }
  }

  // Determine recommended action based on actual content performance
  let recommendedAction: 'none' | 'monitor' | 'method_change' | 'deactivate' | 'investigate' = 'none';
  let alternativeMethod: string | undefined;

  if (!accessCheck.accessible) {
    if (totalArticlesStored >= 3 && successRate === 0) {
      recommendedAction = 'deactivate';
    } else {
      recommendedAction = 'investigate';
    }
  } else if (totalArticlesStored >= 5 && successRate < 20) {
    // Look for better scraping method
    const betterMethod = await findBetterScrapingMethod(supabase, source);
    if (betterMethod) {
      recommendedAction = 'method_change';
      alternativeMethod = betterMethod;
    } else {
      recommendedAction = 'deactivate';
    }
  } else if (totalArticlesStored >= 3 && successRate < 50) {
    recommendedAction = 'monitor';
  } else if (totalArticlesStored === 0 && successRate >= 70) {
    // High connection success but no stored articles - needs monitoring
    recommendedAction = 'monitor';
  }

  // A source is only "healthy" if it actually contributes content regularly
  const isHealthy = healthScore >= 70 && totalArticlesStored >= 3 && successRate >= 50;

  return {
    sourceId: source.id,
    sourceName: source.source_name,
    isHealthy,
    successRate: successRate,
    avgResponseTime: source.avg_response_time_ms || 0,
    lastError: accessCheck.error || source.last_error,
    recommendedAction,
    alternativeMethod,
    healthScore: Math.round(healthScore)
  };
}

async function findBetterScrapingMethod(supabase: any, source: any): Promise<string | null> {
  // Get performance data for similar sources (same domain pattern)
  const domain = source.canonical_domain;
  if (!domain) return null;

  const { data: similarSources } = await supabase
    .from('content_sources')
    .select('scraping_method, success_rate, articles_scraped')
    .ilike('canonical_domain', `%${domain}%`)
    .neq('id', source.id)
    .gte('articles_scraped', 3)
    .gt('success_rate', source.success_rate || 0);

  if (!similarSources || similarSources.length === 0) {
    return null;
  }

  // Find the method with the best success rate
  const methodPerformance = new Map<string, { total: number, count: number }>();
  
  for (const similar of similarSources) {
    const method = similar.scraping_method || 'rss';
    const current = methodPerformance.get(method) || { total: 0, count: 0 };
    current.total += similar.success_rate;
    current.count += 1;
    methodPerformance.set(method, current);
  }

  let bestMethod: string | null = null;
  let bestAverage = 0;

  for (const [method, stats] of methodPerformance) {
    const average = stats.total / stats.count;
    if (average > bestAverage && stats.count >= 2 && method !== source.scraping_method) {
      bestMethod = method;
      bestAverage = average;
    }
  }

  return bestMethod;
}