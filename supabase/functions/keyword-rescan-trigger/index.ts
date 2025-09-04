import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate smart recommendations based on error patterns
function generateRecommendations(errorsByType, successRate) {
  const recommendations = [];
  
  if (errorsByType.access_denied?.length > 0) {
    recommendations.push({
      type: 'access_denied',
      title: 'Access Issues Detected',
      description: `${errorsByType.access_denied.length} sources are blocking access. Consider checking if feeds have moved or require authentication.`,
      actions: ['Check source websites manually', 'Look for alternative RSS feeds', 'Contact source administrators']
    });
  }
  
  if (errorsByType.not_found?.length > 0) {
    recommendations.push({
      type: 'not_found',
      title: 'Missing Feeds Found',
      description: `${errorsByType.not_found.length} feed URLs return 404 errors. These sources may have moved or discontinued their feeds.`,
      actions: ['Verify source URLs are current', 'Search for updated RSS feed links', 'Consider removing inactive sources']
    });
  }
  
  if (errorsByType.timeout?.length > 0) {
    recommendations.push({
      type: 'timeout',
      title: 'Connection Timeouts',
      description: `${errorsByType.timeout.length} sources are timing out. This could be temporary server issues or slow responses.`,
      actions: ['Retry gathering later', 'Check if sources are operational', 'Consider increasing timeout settings']
    });
  }
  
  if (successRate < 50) {
    recommendations.push({
      type: 'low_success_rate',
      title: 'Low Success Rate',
      description: `Only ${successRate}% of sources succeeded. Consider reviewing and updating your source list.`,
      actions: ['Review source quality', 'Update problematic feed URLs', 'Add more reliable sources']
    });
  }
  
  return recommendations;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables');
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { topicId, triggerType = 'keyword_update' } = await req.json();

    if (!topicId) {
      return new Response(
        JSON.stringify({ error: 'topicId is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`🔄 Keyword rescan trigger started for topic: ${topicId}`);

    // Get topic information to determine scraper type
    const { data: topicInfo, error: topicError } = await supabase
      .from('topics')
      .select('topic_type, region')
      .eq('id', topicId)
      .single();

    if (topicError) {
      console.error('❌ Failed to fetch topic info:', topicError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch topic information' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Determine which scraper to use based on topic type
    const scraperFunction = topicInfo.topic_type === 'regional' ? 'universal-scraper' : 'topic-aware-scraper';
    console.log(`📍 Using ${scraperFunction} for ${topicInfo.topic_type} topic`);

    // Get all active sources for this topic
    const { data: sources, error: sourcesError } = await supabase
      .from('content_sources')
      .select('*')
      .eq('topic_id', topicId)
      .eq('is_active', true);

    if (sourcesError) {
      console.error('❌ Failed to fetch sources:', sourcesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch topic sources' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No active sources found for topic',
          sourcesTriggered: 0 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Trigger re-scraping for each source using appropriate scraper with enhanced error handling
    const triggerPromises = sources.map(async (source) => {
      try {
        // Create appropriate request body based on topic type
        const requestBody = topicInfo.topic_type === 'regional'
          ? {
              feedUrl: source.feed_url,
              sourceId: source.id,
              region: topicInfo.region || 'default'
            }
          : {
              feedUrl: source.feed_url,
              topicId: topicId,
              sourceId: source.id
            };

        const { data, error } = await supabase.functions.invoke(scraperFunction, {
          body: requestBody
        });

        if (error) {
          console.error(`❌ Re-scan failed for source ${source.source_name}:`, error);
          
          // Categorize error types for intelligent handling
          let errorType = 'unknown';
          let errorDetails = error.message || 'Unknown error';
          
          if (errorDetails.includes('403') || errorDetails.includes('Forbidden')) {
            errorType = 'access_denied';
          } else if (errorDetails.includes('404') || errorDetails.includes('Not Found')) {
            errorType = 'not_found';
          } else if (errorDetails.includes('timeout') || errorDetails.includes('Signal timed out')) {
            errorType = 'timeout';
          } else if (errorDetails.includes('500') || errorDetails.includes('Internal Server Error')) {
            errorType = 'server_error';
          }
          
          return { 
            success: false, 
            sourceId: source.id, 
            sourceName: source.source_name,
            error: errorDetails,
            errorType: errorType,
            articlesStored: 0
          };
        }

        console.log(`✅ Re-scan successful for ${source.source_name}: ${data?.articlesStored || 0} articles`);
        return { 
          success: true, 
          sourceId: source.id, 
          sourceName: source.source_name,
          articlesStored: data?.articlesStored || 0,
          errorType: null,
          error: null
        };
      } catch (error) {
        console.error(`❌ Re-scan error for source ${source.source_name}:`, error);
        return { 
          success: false, 
          sourceId: source.id, 
          sourceName: source.source_name,
          error: error.message || 'Unknown error',
          errorType: 'exception',
          articlesStored: 0
        };
      }
    });

    const results = await Promise.allSettled(triggerPromises);
    const fulfilledResults = results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
    const successful = fulfilledResults.filter(r => r.success).length;
    const failed = results.length - successful;
    const totalArticles = fulfilledResults.reduce((sum, r) => sum + (r.articlesStored || 0), 0);

    // Calculate success rate and determine response status
    const successRate = sources.length > 0 ? (successful / sources.length) * 100 : 0;
    const isPartialSuccess = successful > 0 && failed > 0;
    const isCompleteFailure = successful === 0 && failed > 0;
    
    // Group errors by type for better reporting
    const errorsByType = {};
    fulfilledResults.filter(r => !r.success).forEach(result => {
      const type = result.errorType || 'unknown';
      if (!errorsByType[type]) errorsByType[type] = [];
      errorsByType[type].push({
        source: result.sourceName,
        error: result.error
      });
    });

    // Create detailed response message
    let message;
    if (isCompleteFailure) {
      message = `All ${failed} sources failed to gather content`;
    } else if (isPartialSuccess) {
      message = `Partial success: ${successful} of ${sources.length} sources gathered content successfully`;
    } else {
      message = `All ${successful} sources gathered content successfully`;
    }

    // Log the trigger event with enhanced context
    const { error: logError } = await supabase
      .from('system_logs')
      .insert({
        level: isCompleteFailure ? 'error' : isPartialSuccess ? 'warn' : 'info',
        message: `Keyword rescan trigger completed: ${message}`,
        context: {
          topicId,
          triggerType,
          topicType: topicInfo.topic_type,
          scraperUsed: scraperFunction,
          totalSources: sources.length,
          successful,
          failed,
          successRate: Math.round(successRate),
          totalArticles,
          errorsByType,
          detailedResults: fulfilledResults,
          isPartialSuccess,
          isCompleteFailure
        },
        function_name: 'keyword-rescan-trigger'
      });

    if (logError) {
      console.warn('⚠️  Failed to log trigger event:', logError);
    }

    // Return response with detailed results
    return new Response(
      JSON.stringify({
        success: !isCompleteFailure, // Success if we got any results
        isPartialSuccess,
        isCompleteFailure,
        message,
        sourcesTriggered: sources.length,
        successful,
        failed,
        successRate: Math.round(successRate),
        totalArticles,
        topicId,
        detailedResults: fulfilledResults,
        errorsByType,
        recommendations: generateRecommendations(errorsByType, successRate)
      }),
      { 
        status: isCompleteFailure ? 206 : 200, // 206 Partial Content for partial success
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Keyword rescan trigger error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error',
        message: 'Keyword rescan trigger failed'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});