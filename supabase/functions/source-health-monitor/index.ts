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
            
          console.log(`🔄 Changed scraping method for ${source.source_name} to ${metrics.alternativeMethod}`);
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
          lastError: error.message,
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
      JSON.stringify({ success: false, error: error.message }),
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
  
  // Calculate health score (0-100)
  let healthScore = 0;
  
  if (accessCheck.accessible) {
    healthScore += 30; // Accessibility bonus
  }
  
  if (source.success_rate !== null) {
    healthScore += (source.success_rate * 0.5); // Success rate contributes 50 points max
  }
  
  if (source.avg_response_time_ms && source.avg_response_time_ms < 10000) {
    healthScore += 20; // Fast response bonus
  }
  
  // Recent activity bonus
  if (source.last_scraped_at) {
    const daysSinceLastScrape = (Date.now() - new Date(source.last_scraped_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastScrape < 1) {
      healthScore += 10;
    }
  }

  // Determine recommended action
  let recommendedAction: 'none' | 'monitor' | 'method_change' | 'deactivate' | 'investigate' = 'none';
  let alternativeMethod: string | undefined;

  if (!accessCheck.accessible) {
    if (source.success_rate === 0 && (source.articles_scraped || 0) >= 3) {
      recommendedAction = 'deactivate';
    } else {
      recommendedAction = 'investigate';
    }
  } else if (source.success_rate !== null && source.success_rate < 20 && (source.articles_scraped || 0) >= 5) {
    // Look for better scraping method
    const betterMethod = await findBetterScrapingMethod(supabase, source);
    if (betterMethod) {
      recommendedAction = 'method_change';
      alternativeMethod = betterMethod;
    } else if (source.success_rate === 0) {
      recommendedAction = 'deactivate';
    } else {
      recommendedAction = 'monitor';
    }
  } else if (source.success_rate !== null && source.success_rate < 50) {
    recommendedAction = 'monitor';
  }

  return {
    sourceId: source.id,
    sourceName: source.source_name,
    isHealthy: healthScore >= 60,
    successRate: source.success_rate || 0,
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