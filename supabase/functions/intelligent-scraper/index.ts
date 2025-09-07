import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapingStrategy {
  method: string;
  priority: number;
  fallbackMethods: string[];
  avgSuccessRate: number;
}

interface ErrorClassification {
  category: 'transport' | 'content' | 'method' | 'site';
  severity: 'low' | 'medium' | 'high' | 'critical';
  retryable: boolean;
  suggestedFix: string;
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
    const { feedUrl, sourceId, region, topicId, forceMethod } = await req.json();

    console.log(`🧠 Intelligent scraper starting for source: ${sourceId}`);
    console.log(`🎯 Target URL: ${feedUrl}`);

    // Get source information and historical performance
    const { data: source, error: sourceError } = await supabase
      .from('content_sources')
      .select('*, scraping_method, success_rate, articles_scraped')
      .eq('id', sourceId)
      .single();

    if (sourceError || !source) {
      console.error('❌ Source not found:', sourceError);
      return createErrorResponse('Source not found', 404);
    }

    // Determine optimal scraping strategy
    const strategy = await determineOptimalStrategy(
      source, 
      feedUrl, 
      forceMethod, 
      supabase
    );

    console.log(`🎲 Selected strategy: ${strategy.method} (priority: ${strategy.priority})`);

    let result = null;
    let attempts = 0;
    const maxAttempts = 3;
    const methodsToTry = [strategy.method, ...strategy.fallbackMethods];

    // Execute scraping with intelligent fallbacks
    for (const method of methodsToTry) {
      if (attempts >= maxAttempts) break;
      attempts++;

      console.log(`🔄 Attempt ${attempts}: Trying method "${method}"`);

      try {
        result = await executeScrapingMethod(
          method, 
          { feedUrl, sourceId, region, topicId }, 
          supabase
        );

        if (result && result.success && result.articles_imported > 0) {
          console.log(`✅ Method "${method}" succeeded with ${result.articles_imported} articles`);
          
          // Update source with successful method
          await updateSourcePerformance(supabase, sourceId, method, true, result.articles_imported);
          
          return new Response(JSON.stringify({
            ...result,
            method_used: method,
            attempts_made: attempts,
            strategy_info: strategy
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } catch (error) {
        console.error(`❌ Method "${method}" failed:`, error.message);
        
        const errorClass = classifyError(error);
        console.log(`🔍 Error classification:`, errorClass);

        // Log detailed error for analysis
        await logScrapingError(supabase, sourceId, method, error, errorClass);

        // If error is not retryable, skip to next method
        if (!errorClass.retryable) {
          console.log(`⚠️ Error not retryable, skipping to next method`);
          continue;
        }

        // Add exponential backoff for retryable errors
        if (attempts < maxAttempts && errorClass.retryable) {
          const delayMs = Math.min(1000 * Math.pow(2, attempts), 10000);
          console.log(`⏱️ Waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // All methods failed
    console.error(`💥 All scraping methods failed for source ${sourceId}`);
    await updateSourcePerformance(supabase, sourceId, strategy.method, false, 0);

    return createErrorResponse(
      `All scraping methods failed. Tried: ${methodsToTry.join(', ')}`,
      500
    );

  } catch (error) {
    console.error('💥 Intelligent scraper error:', error);
    return createErrorResponse(error.message, 500);
  }
});

async function determineOptimalStrategy(
  source: any, 
  feedUrl: string, 
  forceMethod: string | null,
  supabase: any
): Promise<ScrapingStrategy> {
  
  // If method is forced, use it
  if (forceMethod) {
    return {
      method: forceMethod,
      priority: 1,
      fallbackMethods: getFallbackMethods(forceMethod),
      avgSuccessRate: 0
    };
  }

  // Get historical performance data for similar sources
  const { data: performanceData } = await supabase
    .from('content_sources')
    .select('scraping_method, success_rate, source_type, canonical_domain')
    .not('success_rate', 'is', null)
    .order('success_rate', { ascending: false });

  // Analyze URL patterns to predict best method
  const urlAnalysis = analyzeUrlPatterns(feedUrl);
  
  // Priority-based method selection
  const strategies = [
    {
      method: 'rss_discovery',
      priority: 1,
      condition: urlAnalysis.likelyRSS || source.source_type === 'rss',
      avgSuccessRate: getAverageSuccessRate(performanceData, 'rss_discovery') || 100
    },
    {
      method: 'enhanced_html',
      priority: 2, 
      condition: urlAnalysis.modernSite || source.source_type === 'website',
      avgSuccessRate: getAverageSuccessRate(performanceData, 'enhanced_html') || 75
    },
    {
      method: 'topic-aware-scraper',
      priority: 3,
      condition: !!source.topic_id,
      avgSuccessRate: getAverageSuccessRate(performanceData, 'topic-aware-scraper') || 60
    },
    {
      method: 'universal-scraper',
      priority: 4,
      condition: true, // Always available as fallback
      avgSuccessRate: getAverageSuccessRate(performanceData, 'universal-scraper') || 50
    }
  ];

  // Select best strategy based on conditions and success rates
  const validStrategies = strategies
    .filter(s => s.condition)
    .sort((a, b) => (b.avgSuccessRate - a.avgSuccessRate) || (a.priority - b.priority));

  const selected = validStrategies[0] || strategies[strategies.length - 1];
  
  return {
    method: selected.method,
    priority: selected.priority,
    fallbackMethods: getFallbackMethods(selected.method),
    avgSuccessRate: selected.avgSuccessRate
  };
}

function analyzeUrlPatterns(url: string): { likelyRSS: boolean; modernSite: boolean } {
  const lowerUrl = url.toLowerCase();
  
  return {
    likelyRSS: lowerUrl.includes('rss') || lowerUrl.includes('feed') || 
               lowerUrl.includes('atom') || lowerUrl.endsWith('.xml'),
    modernSite: lowerUrl.includes('wordpress') || lowerUrl.includes('medium') ||
                lowerUrl.includes('substack') || lowerUrl.includes('ghost')
  };
}

function getFallbackMethods(primaryMethod: string): string[] {
  const fallbacks: Record<string, string[]> = {
    'rss_discovery': ['enhanced_html', 'universal-scraper', 'beautiful-soup-scraper'],
    'enhanced_html': ['rss_discovery', 'universal-scraper', 'beautiful-soup-scraper'],
    'topic-aware-scraper': ['enhanced_html', 'universal-scraper', 'beautiful-soup-scraper'],
    'universal-scraper': ['enhanced_html', 'beautiful-soup-scraper', 'ai-scraper-recovery'],
    'beautiful-soup-scraper': ['universal-scraper', 'ai-scraper-recovery'],
    'ai-scraper-recovery': ['universal-scraper']
  };
  
  return fallbacks[primaryMethod] || ['universal-scraper', 'beautiful-soup-scraper'];
}

function getAverageSuccessRate(performanceData: any[], method: string): number | null {
  if (!performanceData) return null;
  
  const methodData = performanceData.filter(d => d.scraping_method === method);
  if (methodData.length === 0) return null;
  
  const avgRate = methodData.reduce((sum, d) => sum + (d.success_rate || 0), 0) / methodData.length;
  return Math.round(avgRate * 100) / 100;
}

async function executeScrapingMethod(
  method: string,
  params: any,
  supabase: any
): Promise<any> {
  
  const methodMap: Record<string, string> = {
    'rss_discovery': 'universal-scraper', // Will auto-discover RSS
    'enhanced_html': 'beautiful-soup-scraper',
    'topic-aware-scraper': 'topic-aware-scraper',
    'universal-scraper': 'universal-scraper',
    'beautiful-soup-scraper': 'beautiful-soup-scraper',
    'ai-scraper-recovery': 'ai-scraper-recovery'
  };

  const edgeFunction = methodMap[method] || 'universal-scraper';
  
  console.log(`🚀 Invoking ${edgeFunction} for method ${method}`);

  const { data, error } = await supabase.functions.invoke(edgeFunction, {
    body: {
      ...params,
      preferredMethod: method,
      timeout: method === 'ai-scraper-recovery' ? 60000 : 30000
    }
  });

  if (error) {
    throw new Error(`${method} failed: ${error.message}`);
  }

  return data;
}

function classifyError(error: any): ErrorClassification {
  const message = error.message?.toLowerCase() || '';
  
  // Transport layer errors (often retryable)
  if (message.includes('timeout') || message.includes('econnreset') || 
      message.includes('502') || message.includes('503') || message.includes('520')) {
    return {
      category: 'transport',
      severity: 'medium',
      retryable: true,
      suggestedFix: 'Retry with exponential backoff'
    };
  }
  
  // SSL/Certificate errors (method change needed)
  if (message.includes('certificate') || message.includes('ssl') || message.includes('tls')) {
    return {
      category: 'transport',
      severity: 'high', 
      retryable: false,
      suggestedFix: 'Try HTTP fallback or different method'
    };
  }
  
  // Site-level errors (not retryable)
  if (message.includes('404') || message.includes('403') || message.includes('401')) {
    return {
      category: 'site',
      severity: 'high',
      retryable: false,
      suggestedFix: 'Check URL or find alternative source'
    };
  }
  
  // Content extraction errors (try different method)
  if (message.includes('no articles') || message.includes('invalid_content') || 
      message.includes('parsing')) {
    return {
      category: 'content',
      severity: 'medium',
      retryable: false,
      suggestedFix: 'Try different extraction method'
    };
  }
  
  // Method-specific errors
  return {
    category: 'method',
    severity: 'medium',
    retryable: true,
    suggestedFix: 'Try alternative scraping method'
  };
}

async function updateSourcePerformance(
  supabase: any,
  sourceId: string,
  method: string,
  success: boolean,
  articlesScraped: number
): Promise<void> {
  
  try {
    const now = new Date().toISOString();
    
    // Update source with performance metrics
    const { error } = await supabase
      .from('content_sources')
      .update({
        scraping_method: method,
        last_scraped_at: now,
        articles_scraped: articlesScraped,
        // Update success rate based on recent performance
        success_rate: success ? 
          supabase.raw(`LEAST(100, GREATEST(success_rate * 0.8 + 20, success_rate + 5))`) :
          supabase.raw(`GREATEST(0, success_rate * 0.9 - 10)`)
      })
      .eq('id', sourceId);

    if (error) {
      console.error('Failed to update source performance:', error);
    }
  } catch (error) {
    console.error('Error updating source performance:', error);
  }
}

async function logScrapingError(
  supabase: any,
  sourceId: string,
  method: string,
  error: any,
  classification: ErrorClassification
): Promise<void> {
  
  try {
    await supabase
      .from('system_logs')
      .insert({
        level: classification.severity === 'critical' ? 'error' : 'warn',
        message: `Scraping failed: ${method}`,
        function_name: 'intelligent-scraper',
        context: {
          source_id: sourceId,
          method: method,
          error: error.message,
          classification: classification,
          timestamp: new Date().toISOString()
        }
      });
  } catch (logError) {
    console.error('Failed to log scraping error:', logError);
  }
}

function createErrorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ 
      success: false,
      error: message,
      articles_imported: 0
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}