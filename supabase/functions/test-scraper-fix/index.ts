import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚨 EMERGENCY SCRAPE TEST - Testing fixed scraping infrastructure');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get "AI for agency" topic and its sources
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('name', 'AI for agency')
      .single();

    if (topicError || !topic) {
      throw new Error(`AI for agency topic not found: ${topicError?.message}`);
    }

    console.log(`✅ Found topic: ${topic.name} (${topic.topic_type})`);

    // Get active sources for this topic
    const { data: sources, error: sourcesError } = await supabase
      .from('content_sources')
      .select('*')
      .eq('topic_id', topic.id)
      .eq('is_active', true)
      .limit(3); // Test with first 3 sources

    if (sourcesError) {
      throw new Error(`Failed to get sources: ${sourcesError.message}`);
    }

    if (!sources || sources.length === 0) {
      throw new Error('No active sources found for AI for agency topic');
    }

    console.log(`📋 Testing ${sources.length} sources`);

    const results = [];
    let successCount = 0;

    for (const source of sources) {
      try {
        console.log(`\n🎯 Testing source: ${source.source_name}`);
        console.log(`📡 Feed URL: ${source.feed_url}`);

        // Use topic-aware-scraper for keyword-based topics
        const scraperFunction = topic.topic_type === 'regional' ? 'universal-scraper' : 'topic-aware-scraper';
        console.log(`🔧 Using scraper: ${scraperFunction}`);

        // Create the request body based on scraper type
        const requestBody = scraperFunction === 'universal-scraper' 
          ? {
              feedUrl: source.feed_url,
              sourceId: source.id,
              region: topic.region || 'general'
            }
          : {
              feedUrl: source.feed_url,
              topicId: topic.id,
              sourceId: source.id
            };

        console.log(`📤 Request body:`, requestBody);

        // Call the scraper function
        const startTime = Date.now();
        const response = await supabase.functions.invoke(scraperFunction, {
          body: requestBody
        });

        const duration = Date.now() - startTime;

        if (response.error) {
          throw new Error(`Scraper error: ${response.error.message}`);
        }

        const result = response.data;
        console.log(`📊 Scraper response:`, result);

        let articlesStored = 0;
        if (result.success) {
          articlesStored = result.articlesStored || result.articlesScraped || 0;
          if (articlesStored > 0) {
            successCount++;
            console.log(`🎉 SUCCESS! ${articlesStored} articles stored from ${source.source_name}`);
          } else {
            console.log(`⚠️ No articles stored from ${source.source_name}: ${result.message || 'Unknown reason'}`);
          }
        } else {
          console.log(`❌ Scraping failed for ${source.source_name}: ${result.errors?.join(', ') || result.error || 'Unknown error'}`);
        }

        results.push({
          source_name: source.source_name,
          feed_url: source.feed_url,
          success: result.success || false,
          articles_found: result.articlesFound || 0,
          articles_stored: articlesStored,
          errors: result.errors || [result.error].filter(Boolean),
          duration_ms: duration,
          scraper_used: scraperFunction
        });

        // Small delay between sources
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`❌ Error testing ${source.source_name}:`, error);
        results.push({
          source_name: source.source_name,
          feed_url: source.feed_url,
          success: false,
          articles_found: 0,
          articles_stored: 0,
          errors: [error instanceof Error ? error.message : String(error)],
          duration_ms: 0,
          scraper_used: 'failed'
        });
      }
    }

    // Check current article counts
    const { data: totalArticles, count: totalCount } = await supabase
      .from('articles')
      .select('id', { count: 'exact' })
      .eq('topic_id', topic.id);

    const { data: pendingArticles, count: pendingCount } = await supabase
      .from('articles')
      .select('id', { count: 'exact' })
      .eq('topic_id', topic.id)
      .eq('processing_status', 'new');

    console.log(`\n📊 EMERGENCY TEST RESULTS:`);
    console.log(`✅ Successful scrapes: ${successCount}/${sources.length}`);
    console.log(`📄 Total articles in topic: ${totalCount || 0}`);
    console.log(`⏳ Pending articles: ${pendingCount || 0}`);

    const summary = {
      success: successCount > 0,
      topic_name: topic.name,
      topic_type: topic.topic_type,
      sources_tested: sources.length,
      successful_scrapes: successCount,
      failed_scrapes: sources.length - successCount,
      total_articles_in_topic: totalCount || 0,
      pending_articles: pendingCount || 0,
      results,
      message: successCount > 0 
        ? `🎉 EMERGENCY FIX WORKING! ${successCount} sources successfully scraped articles`
        : `❌ Emergency fix needs more work - no articles were scraped`,
      recommendations: successCount === 0 ? [
        'Check edge function logs for detailed error messages',
        'Verify source URLs are accessible',
        'Consider lowering content validation thresholds further',
        'Check if sources are blocking the user agents'
      ] : [
        'Emergency fix appears to be working!',
        'Monitor article processing pipeline',
        'Check for duplicate detection issues',
        'Verify article relevance scoring'
      ]
    };

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💥 Emergency test failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      message: '🚨 Emergency scraping test failed - check logs for details'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});