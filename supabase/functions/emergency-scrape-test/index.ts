import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Inline scraper utility functions (can't import from frontend)
function getScraperFunction(topicType: 'regional' | 'keyword'): string {
  return topicType === 'regional' ? 'universal-scraper' : 'topic-aware-scraper';
}

function createScraperRequestBody(
  topicType: 'regional' | 'keyword',
  feedUrl: string,
  options: { topicId?: string; sourceId?: string; region?: string; }
) {
  if (topicType === 'regional') {
    return {
      feedUrl,
      sourceId: options.sourceId,
      region: options.region || 'default'
    };
  } else {
    return {
      feedUrl,
      topicId: options.topicId,
      sourceId: options.sourceId
    };
  }
}

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
      .eq('slug', 'ai-for-agency')
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
      .limit(5); // Test with first 5 sources

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

        // Get the appropriate scraper function based on topic type
        const scraperFunction = getScraperFunction(topic.topic_type);
        console.log(`🔧 Using scraper: ${scraperFunction}`);

        // Create the request body
        const requestBody = createScraperRequestBody(
          topic.topic_type,
          source.feed_url,
          {
            topicId: topic.id,
            sourceId: source.id,
            region: topic.region
          }
        );

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
        console.log(`✅ Scraper response:`, result);

        if (result.success && result.articlesStored > 0) {
          successCount++;
          console.log(`🎉 SUCCESS! ${result.articlesStored} articles stored from ${source.source_name}`);
        } else {
          console.log(`⚠️ No articles stored from ${source.source_name}: ${result.message || 'Unknown reason'}`);
        }

        results.push({
          source_name: source.source_name,
          feed_url: source.feed_url,
          success: result.success || false,
          articles_found: result.articlesFound || 0,
          articles_stored: result.articlesStored || 0,
          errors: result.errors || [],
          duration_ms: duration,
          scraper_used: scraperFunction
        });

        // Small delay between sources
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Error testing ${source.source_name}:`, error);
        results.push({
          source_name: source.source_name,
          feed_url: source.feed_url,
          success: false,
          articles_found: 0,
          articles_stored: 0,
          errors: [error.message],
          duration_ms: 0,
          scraper_used: 'failed'
        });
      }
    }

    // Check if any articles are now in the pipeline
    const { data: articlesCount } = await supabase
      .from('articles')
      .select('id', { count: 'exact' })
      .eq('topic_id', topic.id);

    const { data: pendingArticles } = await supabase
      .from('articles')
      .select('id', { count: 'exact' })
      .eq('topic_id', topic.id)
      .eq('processing_status', 'new');

    console.log(`\n📊 EMERGENCY TEST RESULTS:`);
    console.log(`✅ Successful scrapes: ${successCount}/${sources.length}`);
    console.log(`📄 Total articles in topic: ${articlesCount?.length || 0}`);
    console.log(`⏳ Pending articles: ${pendingArticles?.length || 0}`);

    const summary = {
      success: successCount > 0,
      topic_name: topic.name,
      topic_type: topic.topic_type,
      sources_tested: sources.length,
      successful_scrapes: successCount,
      failed_scrapes: sources.length - successCount,
      total_articles_in_topic: articlesCount?.length || 0,
      pending_articles: pendingArticles?.length || 0,
      results,
      message: successCount > 0 
        ? `🎉 EMERGENCY FIX WORKING! ${successCount} sources successfully scraped articles`
        : `❌ Emergency fix failed - no articles were scraped`
    };

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💥 Emergency test failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      message: '🚨 Emergency scraping test failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});