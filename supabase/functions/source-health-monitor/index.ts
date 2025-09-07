import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthCheckResult {
  sourceId: string;
  sourceName: string;
  feedUrl: string;
  isAccessible: boolean;
  hasValidRSS: boolean;
  responseTime: number;
  errorMessage?: string;
  suggestions: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables');
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { sourceIds, checkAll } = await req.json().catch(() => ({}));

    console.log('🔍 Starting source health monitoring...');

    // Get sources to check
    let query = supabase
      .from('content_sources')
      .select('id, source_name, feed_url, is_active, success_rate, last_scraped_at');

    if (!checkAll && sourceIds?.length > 0) {
      query = query.in('id', sourceIds);
    } else if (checkAll) {
      query = query.eq('is_active', true);
    } else {
      // Check sources with poor success rates or recent failures
      query = query
        .eq('is_active', true)
        .or('success_rate.lt.50,last_scraped_at.lt.now() - interval \'24 hours\'');
    }

    const { data: sources, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch sources: ${error.message}`);
    }

    console.log(`📊 Checking health of ${sources?.length || 0} sources...`);

    const healthResults: HealthCheckResult[] = [];
    const batchSize = 5; // Process 5 sources at a time

    // Process sources in batches to avoid overwhelming the system
    for (let i = 0; i < (sources?.length || 0); i += batchSize) {
      const batch = sources!.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (source) => {
        return await checkSourceHealth(source);
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          healthResults.push(result.value);
        } else {
          console.error(`❌ Health check failed for source ${batch[index].id}:`, result.reason);
          healthResults.push({
            sourceId: batch[index].id,
            sourceName: batch[index].source_name,
            feedUrl: batch[index].feed_url,
            isAccessible: false,
            hasValidRSS: false,
            responseTime: 0,
            errorMessage: result.reason?.message || 'Unknown error',
            suggestions: ['Check source configuration', 'Verify URL accessibility']
          });
        }
      });

      // Add delay between batches
      if (i + batchSize < (sources?.length || 0)) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Update source health metrics
    const failingSources = healthResults.filter(r => !r.isAccessible || !r.hasValidRSS);
    const healthySources = healthResults.filter(r => r.isAccessible && r.hasValidRSS);

    console.log(`📈 Health check complete: ${healthySources.length} healthy, ${failingSources.length} failing`);

    // Log failing sources for investigation
    for (const failing of failingSources) {
      await supabase
        .from('system_logs')
        .insert({
          level: 'warn',
          message: `Source health check failed: ${failing.sourceName}`,
          context: {
            source_id: failing.sourceId,
            error: failing.errorMessage,
            suggestions: failing.suggestions,
            feed_url: failing.feedUrl
          },
          function_name: 'source-health-monitor'
        });
    }

    // Auto-deactivate sources that have been failing for too long
    const criticalFailures = failingSources.filter(r => 
      r.errorMessage?.includes('NOT_FOUND') || 
      r.errorMessage?.includes('INVALID_CONTENT') ||
      r.errorMessage?.includes('certificate')
    );

    if (criticalFailures.length > 0) {
      console.log(`⚠️ Found ${criticalFailures.length} sources with critical failures`);
      
      for (const critical of criticalFailures) {
        // Check how long this source has been failing
        const { data: recentLogs } = await supabase
          .from('system_logs')
          .select('created_at')
          .eq('context->>source_id', critical.sourceId)
          .eq('level', 'warn')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
          .order('created_at', { ascending: false });

        if ((recentLogs?.length || 0) >= 3) {
          console.log(`🚫 Deactivating source ${critical.sourceName} due to repeated failures`);
          
          await supabase
            .from('content_sources')
            .update({ 
              is_active: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', critical.sourceId);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalSources: sources?.length || 0,
        healthySources: healthySources.length,
        failingSources: failingSources.length,
        criticalFailures: criticalFailures.length,
        results: healthResults,
        message: `Health check completed: ${healthySources.length}/${sources?.length} sources healthy`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Source health monitor error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Health monitoring failed',
        message: 'Source health monitoring encountered an error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function checkSourceHealth(source: any): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const suggestions: string[] = [];
  
  try {
    console.log(`🔍 Checking health of: ${source.source_name}`);
    
    // Test URL accessibility
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(source.feed_url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SourceHealthMonitor/1.0)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html'
      }
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorType = response.status === 404 ? 'URL not found (404)' :
                       response.status === 403 ? 'Access forbidden (403)' :
                       response.status >= 500 ? 'Server error' :
                       `HTTP ${response.status}`;
      
      if (response.status === 404) {
        suggestions.push('Check if the RSS feed URL has changed');
        suggestions.push('Try common RSS paths: /feed/, /rss/, /rss.xml');
      } else if (response.status === 403) {
        suggestions.push('The source may be blocking automated requests');
        suggestions.push('Contact the source about API access');
      } else if (response.status >= 500) {
        suggestions.push('Server issue at source - may be temporary');
        suggestions.push('Try again later or contact the source');
      }

      return {
        sourceId: source.id,
        sourceName: source.source_name,
        feedUrl: source.feed_url,
        isAccessible: false,
        hasValidRSS: false,
        responseTime,
        errorMessage: errorType,
        suggestions
      };
    }

    // Check if it's valid RSS/XML
    const contentType = response.headers.get('content-type') || '';
    const content = await response.text();
    
    const isValidRSS = (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) &&
                       (content.includes('<rss') || content.includes('<feed') || content.includes('<atom') || content.includes('<channel'));

    if (!isValidRSS) {
      suggestions.push('URL does not return valid RSS/Atom feed');
      suggestions.push('Check if this is the correct feed URL');
      suggestions.push('Look for RSS feed links on the website');
    }

    // Check for common issues
    if (content.length < 500) {
      suggestions.push('Feed content is very short - may be empty or error page');
    }

    if (content.includes('404') || content.includes('not found')) {
      suggestions.push('Content appears to be an error page');
    }

    // Performance suggestions
    if (responseTime > 10000) {
      suggestions.push('Source response time is slow (>10s) - may cause timeouts');
    }

    const result: HealthCheckResult = {
      sourceId: source.id,
      sourceName: source.source_name,
      feedUrl: source.feed_url,
      isAccessible: true,
      hasValidRSS: isValidRSS,
      responseTime,
      suggestions: suggestions.length > 0 ? suggestions : ['Source appears healthy']
    };

    console.log(`✅ Health check completed for ${source.source_name}: ${isValidRSS ? 'Healthy' : 'Issues found'}`);
    return result;

  } catch (error) {
    const responseTime = Date.now() - startTime;
    let errorMessage = error.message;
    
    // Provide specific suggestions based on error type
    if (error.message.includes('certificate')) {
      suggestions.push('SSL certificate issue - try HTTP instead of HTTPS');
      errorMessage = 'SSL Certificate Error';
    } else if (error.message.includes('timeout') || error.name === 'AbortError') {
      suggestions.push('Request timed out - source may be slow or unresponsive');
      errorMessage = 'Timeout Error';
    } else if (error.message.includes('DNS') || error.message.includes('ENOTFOUND')) {
      suggestions.push('Domain not found - check if URL is correct');
      errorMessage = 'DNS Error';
    } else {
      suggestions.push('Network or connection error');
      suggestions.push('Verify URL is accessible from external networks');
    }

    console.log(`❌ Health check failed for ${source.source_name}: ${errorMessage}`);

    return {
      sourceId: source.id,
      sourceName: source.source_name,
      feedUrl: source.feed_url,
      isAccessible: false,
      hasValidRSS: false,
      responseTime,
      errorMessage,
      suggestions
    };
  }
}