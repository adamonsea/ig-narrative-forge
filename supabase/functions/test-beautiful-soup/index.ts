import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧪 Testing Beautiful Soup Scraper...');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Test URLs - mix of RSS and HTML-only sites
    const testUrls = [
      'https://www.bbc.com/news/england/sussex',
      'https://www.localnews.co.uk',
      'https://feeds.bbci.co.uk/news/england/sussex/rss.xml',
      'https://www.hastingsobserver.co.uk'
    ];

    const results = [];

    for (const testUrl of testUrls) {
      console.log(`🔬 Testing Beautiful Soup on: ${testUrl}`);
      
      try {
        const beautifulSoupResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/beautiful-soup-scraper`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            feedUrl: testUrl,
            maxArticles: 3 // Limit for testing
          })
        });

        if (beautifulSoupResponse.ok) {
          const result = await beautifulSoupResponse.json();
          results.push({
            url: testUrl,
            success: result.success,
            articlesFound: result.articlesFound,
            articlesScraped: result.articlesScraped,
            method: result.method,
            errors: result.errors || []
          });
          console.log(`✅ Test successful: ${result.articlesFound} articles found, ${result.articlesScraped} scraped`);
        } else {
          const errorText = await beautifulSoupResponse.text();
          results.push({
            url: testUrl,
            success: false,
            error: `HTTP ${beautifulSoupResponse.status}: ${errorText}`,
            articlesFound: 0,
            articlesScraped: 0
          });
          console.log(`❌ Test failed: HTTP ${beautifulSoupResponse.status}`);
        }
      } catch (error) {
        results.push({
          url: testUrl,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          articlesFound: 0,
          articlesScraped: 0
        });
        console.log(`❌ Test error: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Rate limiting between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Summary
    const successful = results.filter(r => r.success).length;
    const totalArticles = results.reduce((sum, r) => sum + (r.articlesScraped || 0), 0);

    console.log(`🧪 Beautiful Soup Test Results:`);
    console.log(`   ✅ Successful: ${successful}/${results.length} tests`);
    console.log(`   📊 Total articles: ${totalArticles}`);

    return new Response(JSON.stringify({
      success: true,
      summary: {
        testsRun: results.length,
        successful,
        failed: results.length - successful,
        totalArticlesScraped: totalArticles
      },
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('🚨 Beautiful Soup test error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});