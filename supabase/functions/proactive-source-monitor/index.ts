import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SourceHealthMetrics {
  sourceId: string;
  currentMethod: string;
  currentSuccessRate: number;
  recentFailures: number;
  suggestedMethod?: string;
  suggestedSuccessRate?: number;
  actionRequired: 'none' | 'method_change' | 'deactivate' | 'investigate';
  reasoning: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('🔍 Starting proactive source health monitoring...');

    // Get all active sources with their performance metrics
    const { data: sources, error: sourcesError } = await supabase
      .from('content_sources')
      .select(`
        id,
        source_name,
        scraping_method,
        success_rate,
        last_scraped_at,
        articles_scraped,
        is_active,
        canonical_domain,
        feed_url
      `)
      .eq('is_active', true)
      .not('success_rate', 'is', null);

    if (sourcesError || !sources) {
      throw new Error(`Failed to fetch sources: ${sourcesError?.message}`);
    }

    console.log(`📊 Analyzing ${sources.length} active sources...`);

    const healthReports: SourceHealthMetrics[] = [];
    let methodChangesRecommended = 0;
    let sourcesToDeactivate = 0;
    let sourcesToInvestigate = 0;

    // Analyze each source
    for (const source of sources) {
      const healthMetrics = await analyzeSourceHealth(supabase, source);
      healthReports.push(healthMetrics);

      // Take proactive actions based on recommendations
      if (healthMetrics.actionRequired === 'method_change' && healthMetrics.suggestedMethod) {
        console.log(`🔧 Auto-updating method for ${source.source_name}: ${source.scraping_method} → ${healthMetrics.suggestedMethod}`);
        
        await supabase
          .from('content_sources')
          .update({
            scraping_method: healthMetrics.suggestedMethod,
            updated_at: new Date().toISOString()
          })
          .eq('id', source.id);

        methodChangesRecommended++;
        
        // Log the change
        await supabase
          .from('system_logs')
          .insert({
            level: 'info',
            message: `Proactively changed scraping method`,
            function_name: 'proactive-source-monitor',
            context: {
              source_id: source.id,
              source_name: source.source_name,
              old_method: source.scraping_method,
              new_method: healthMetrics.suggestedMethod,
              reasoning: healthMetrics.reasoning
            }
          });

      } else if (healthMetrics.actionRequired === 'deactivate') {
        console.log(`⚠️ Deactivating failing source: ${source.source_name}`);
        
        await supabase
          .from('content_sources')
          .update({
            is_active: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', source.id);

        sourcesToDeactivate++;
        
        // Log deactivation
        await supabase
          .from('system_logs')
          .insert({
            level: 'warn',
            message: `Proactively deactivated failing source`,
            function_name: 'proactive-source-monitor',
            context: {
              source_id: source.id,
              source_name: source.source_name,
              success_rate: source.success_rate,
              reasoning: healthMetrics.reasoning
            }
          });

      } else if (healthMetrics.actionRequired === 'investigate') {
        sourcesToInvestigate++;
        
        // Log for manual investigation
        await supabase
          .from('system_logs')
          .insert({
            level: 'warn',
            message: `Source requires investigation`,
            function_name: 'proactive-source-monitor',
            context: {
              source_id: source.id,
              source_name: source.source_name,
              success_rate: source.success_rate,
              reasoning: healthMetrics.reasoning
            }
          });
      }
    }

    // Generate summary report
    const summary = {
      total_sources_analyzed: sources.length,
      method_changes_applied: methodChangesRecommended,
      sources_deactivated: sourcesToDeactivate,
      sources_flagged_for_investigation: sourcesToInvestigate,
      health_reports: healthReports.filter(r => r.actionRequired !== 'none'),
      timestamp: new Date().toISOString()
    };

    console.log('📈 Proactive monitoring complete:', {
      analyzed: summary.total_sources_analyzed,
      changed: summary.method_changes_applied,
      deactivated: summary.sources_deactivated,
      flagged: summary.sources_flagged_for_investigation
    });

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💥 Proactive monitoring error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function analyzeSourceHealth(
  supabase: any, 
  source: any
): Promise<SourceHealthMetrics> {
  
  const successRate = source.success_rate || 0;
  const currentMethod = source.scraping_method || 'unknown';
  
  // Get historical performance for different methods for similar sources
  const { data: similarSources } = await supabase
    .from('content_sources')
    .select('scraping_method, success_rate, canonical_domain')
    .neq('id', source.id)
    .not('success_rate', 'is', null)
    .order('success_rate', { ascending: false });

  // Find the best performing method for similar sources
  const methodPerformance = calculateMethodPerformance(similarSources || []);
  const bestAlternativeMethod = findBestAlternativeMethod(currentMethod, methodPerformance);

  // Determine action required
  let actionRequired: 'none' | 'method_change' | 'deactivate' | 'investigate' = 'none';
  let reasoning = 'Source performing adequately';
  let suggestedMethod: string | undefined;
  let suggestedSuccessRate: number | undefined;

  if (successRate < 10) {
    actionRequired = 'deactivate';
    reasoning = `Extremely low success rate (${successRate}%) - recommend deactivation`;
  } else if (successRate < 30 && bestAlternativeMethod && bestAlternativeMethod.avgSuccessRate > successRate + 20) {
    actionRequired = 'method_change';
    suggestedMethod = bestAlternativeMethod.method;
    suggestedSuccessRate = bestAlternativeMethod.avgSuccessRate;
    reasoning = `Low success rate (${successRate}%) - ${bestAlternativeMethod.method} shows ${bestAlternativeMethod.avgSuccessRate}% average`;
  } else if (successRate < 40) {
    actionRequired = 'investigate';
    reasoning = `Below-average success rate (${successRate}%) - manual review recommended`;
  } else if (bestAlternativeMethod && bestAlternativeMethod.avgSuccessRate > successRate + 30) {
    actionRequired = 'method_change';
    suggestedMethod = bestAlternativeMethod.method;
    suggestedSuccessRate = bestAlternativeMethod.avgSuccessRate;
    reasoning = `Significantly better method available: ${bestAlternativeMethod.method} (${bestAlternativeMethod.avgSuccessRate}% vs ${successRate}%)`;
  }

  return {
    sourceId: source.id,
    currentMethod,
    currentSuccessRate: successRate,
    recentFailures: 0, // Could be calculated from logs if needed
    suggestedMethod,
    suggestedSuccessRate,
    actionRequired,
    reasoning
  };
}

function calculateMethodPerformance(sources: any[]): Record<string, { avgSuccessRate: number; count: number }> {
  const methodStats: Record<string, { total: number; count: number }> = {};
  
  for (const source of sources) {
    const method = source.scraping_method || 'unknown';
    if (!methodStats[method]) {
      methodStats[method] = { total: 0, count: 0 };
    }
    methodStats[method].total += source.success_rate || 0;
    methodStats[method].count += 1;
  }
  
  const performance: Record<string, { avgSuccessRate: number; count: number }> = {};
  for (const [method, stats] of Object.entries(methodStats)) {
    performance[method] = {
      avgSuccessRate: Math.round(stats.total / stats.count * 100) / 100,
      count: stats.count
    };
  }
  
  return performance;
}

function findBestAlternativeMethod(
  currentMethod: string, 
  methodPerformance: Record<string, { avgSuccessRate: number; count: number }>
): { method: string; avgSuccessRate: number } | null {
  
  const alternatives = Object.entries(methodPerformance)
    .filter(([method]) => method !== currentMethod)
    .filter(([, stats]) => stats.count >= 3) // Only consider methods with sufficient data
    .sort(([, a], [, b]) => b.avgSuccessRate - a.avgSuccessRate);

  if (alternatives.length === 0) {
    return null;
  }

  const [bestMethod, stats] = alternatives[0];
  return {
    method: bestMethod,
    avgSuccessRate: stats.avgSuccessRate
  };
}