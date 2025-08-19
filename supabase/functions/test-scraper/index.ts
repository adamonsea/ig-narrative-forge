import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('🧪 Starting scraper test...');
    
    // Get a sample of active sources
    const { data: sources, error: sourcesError } = await supabase
      .from('content_sources')
      .select('id, source_name, feed_url')
      .eq('is_active', true)
      .limit(3);

    if (sourcesError) {
      throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
    }

    console.log(`📋 Testing ${sources?.length || 0} sources`);

    const testResults = [];

    if (sources && sources.length > 0) {
      for (const source of sources) {
        console.log(`🎯 Testing: ${source.source_name} (${source.feed_url})`);
        
        try {
          // Test the hybrid scraper
          const scrapeResponse = await supabase.functions.invoke('hybrid-scraper', {
            body: {
              feedUrl: source.feed_url,
              sourceId: source.id,
              region: 'Eastbourne'
            }
          });

          if (scrapeResponse.error) {
            throw new Error(scrapeResponse.error.message || 'Scrape function failed');
          }

          const result = scrapeResponse.data;
          testResults.push({
            source: source.source_name,
            url: source.feed_url,
            success: result.success,
            articlesFound: result.articlesFound,
            articlesScraped: result.articlesScraped,
            method: result.method,
            errors: result.errors || []
          });

          console.log(`✅ Test completed for ${source.source_name}:`, result);

        } catch (error) {
          console.error(`❌ Test failed for ${source.source_name}:`, error);
          testResults.push({
            source: source.source_name,
            url: source.feed_url,
            success: false,
            articlesFound: 0,
            articlesScraped: 0,
            method: 'none',
            errors: [error.message]
          });
        }

        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const summary = {
      success: true,
      testsRun: testResults.length,
      successfulTests: testResults.filter(r => r.success).length,
      failedTests: testResults.filter(r => !r.success).length,
      totalArticlesFound: testResults.reduce((sum, r) => sum + r.articlesFound, 0),
      totalArticlesScraped: testResults.reduce((sum, r) => sum + r.articlesScraped, 0),
      results: testResults
    };

    console.log('🎉 Scraper test completed:', summary);
    
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Scraper test error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        testsRun: 0,
        successfulTests: 0,
        failedTests: 0,
        totalArticlesFound: 0,
        totalArticlesScraped: 0,
        results: []
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});