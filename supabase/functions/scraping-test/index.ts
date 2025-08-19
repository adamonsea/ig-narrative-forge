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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log('🧪 Starting comprehensive scraping test...');
    
    // Get all active sources
    const { data: sources, error: sourcesError } = await supabase
      .from('content_sources')
      .select('*')
      .eq('is_active', true)
      .order('source_name');
    
    if (sourcesError) {
      throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
    }
    
    console.log(`Found ${sources.length} active sources to test`);
    
    const results = [];
    
    // Test each source with hybrid-scraper
    for (const source of sources.slice(0, 5)) { // Test first 5 sources
      console.log(`\n🔍 Testing source: ${source.source_name} (${source.feed_url})`);
      
      try {
        const scrapeResponse = await supabase.functions.invoke('hybrid-scraper', {
          body: {
            feedUrl: source.feed_url,
            sourceId: source.id,
            region: source.region || 'Eastbourne'
          }
        });
        
        if (scrapeResponse.error) {
          console.error(`❌ Scrape failed for ${source.source_name}:`, scrapeResponse.error);
          results.push({
            source: source.source_name,
            status: 'failed',
            error: scrapeResponse.error.message,
            articles: 0
          });
        } else {
          console.log(`✅ Scrape succeeded for ${source.source_name}:`, scrapeResponse.data);
          results.push({
            source: source.source_name,
            status: 'success',
            articlesFound: scrapeResponse.data.articlesFound || 0,
            articlesScraped: scrapeResponse.data.articlesScraped || 0,
            method: scrapeResponse.data.method || 'unknown'
          });
        }
      } catch (error) {
        console.error(`❌ Error testing ${source.source_name}:`, error);
        results.push({
          source: source.source_name,
          status: 'error',
          error: error.message,
          articles: 0
        });
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Test content generation on a recent article
    console.log('\n🤖 Testing content generation...');
    const { data: recentArticle } = await supabase
      .from('articles')
      .select('*')
      .eq('processing_status', 'new')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    let generationResult = null;
    if (recentArticle) {
      try {
        const genResponse = await supabase.functions.invoke('content-generator', {
          body: { articleId: recentArticle.id }
        });
        
        if (genResponse.error) {
          generationResult = { status: 'failed', error: genResponse.error.message };
        } else {
          generationResult = { status: 'success', slideCount: genResponse.data.slideCount };
        }
      } catch (error) {
        generationResult = { status: 'error', error: error.message };
      }
    } else {
      generationResult = { status: 'skipped', reason: 'No new articles found' };
    }
    
    // Summary
    const summary = {
      timestamp: new Date().toISOString(),
      sourcestested: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      errors: results.filter(r => r.status === 'error').length,
      totalArticlesFound: results.reduce((sum, r) => sum + (r.articlesFound || 0), 0),
      totalArticlesScraped: results.reduce((sum, r) => sum + (r.articlesScraped || 0), 0),
      contentGeneration: generationResult,
      details: results
    };
    
    console.log('\n📊 Test Summary:', summary);
    
    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('🚨 Test suite error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});