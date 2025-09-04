import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ResilientScraper } from '../_shared/resilient-scraper.ts';
import { DatabaseOperations } from '../_shared/database-operations.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const startTime = Date.now();

  try {
    const { feedUrl, sourceId, region } = await req.json();

    if (!feedUrl || !sourceId || !region) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: feedUrl, sourceId, region' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`🚀 Hybrid scraper started for source: ${sourceId}, region: ${region}`);
    console.log(`🌐 Target URL: ${feedUrl}`);

    // Get source information
    const { data: sourceInfo, error: sourceError } = await supabase
      .from('content_sources')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (sourceError || !sourceInfo) {
      console.error('❌ Source not found:', sourceError);
      return new Response(
        JSON.stringify({ error: 'Source not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Find associated topic
    let topicId = null;
    if (sourceInfo.topic_id) {
      topicId = sourceInfo.topic_id;
    } else {
      // Fallback: find regional topic matching this region
      const { data: topicData } = await supabase
        .from('topics')
        .select('id')
        .eq('topic_type', 'regional')
        .eq('region', region)
        .eq('is_active', true)
        .single();

      if (topicData) {
        topicId = topicData.id;
      }
    }

    // Initialize resilient scraper
    const resilientScraper = new ResilientScraper(supabase);
    const dbOps = new DatabaseOperations(supabase);

    console.log(`🔄 Starting resilient scraping for ${sourceInfo.source_name}`);
    
    // Use resilient scraping with intelligent fallbacks
    const scrapingResult = await resilientScraper.scrapeWithResilience(
      supabase,
      region,
      topicId,
      {
        useCache: true,
        enableHealthChecks: true,
        maxRetries: 3,
        enableFallbacks: true
      }
    );

    let storedCount = 0;
    let duplicateCount = 0;
    let discardedCount = 0;

    if (scrapingResult?.success && scrapingResult.articles.length > 0) {
      console.log(`✅ Resilient scraping successful: ${scrapingResult.articles.length} articles found`);
      console.log(`🔄 Method used: ${scrapingResult.method}, Cache used: ${scrapingResult.cacheUsed}`);
      
      // Store articles with enhanced filtering
      const storageResult = await dbOps.storeArticles(
        scrapingResult.articles,
        sourceId,
        region,
        topicId
      );
      
      storedCount = storageResult.stored;
      duplicateCount = storageResult.duplicates;
      discardedCount = storageResult.discarded;

      console.log(`📊 Storage complete: ${storedCount} stored, ${duplicateCount} duplicates, ${discardedCount} discarded`);
    } else {
      console.log(`❌ Resilient scraping failed or no articles found`);
    }

    // Update source metrics
    const responseTime = Date.now() - startTime;
    if (scrapingResult?.source) {
      await dbOps.updateSourceMetrics(
        scrapingResult.source.id,
        scrapingResult.success,
        scrapingResult.method,
        responseTime
      );
    }

    // Log system event with resilient scraping details
    await dbOps.logSystemEvent(
      scrapingResult?.success ? 'info' : 'warn',
      `Hybrid scraper completed for ${sourceInfo.source_name}`,
      {
        sourceId,
        region,
        topicId,
        method: scrapingResult?.method || 'unknown',
        articlesFound: scrapingResult?.articlesFound || 0,
        articlesScraped: scrapingResult?.articlesScraped || 0,
        stored: storedCount,
        duplicates: duplicateCount,
        discarded: discardedCount,
        responseTime,
        cacheUsed: scrapingResult?.cacheUsed || false,
        fallbackUsed: scrapingResult?.fallbackUsed || false,
        sourceHealth: scrapingResult?.sourceHealth || 'unknown',
        errors: scrapingResult?.errors || [],
        circuitBreakerStatus: scrapingResult?.circuitBreakerStatus || 'unknown'
      },
      'hybrid-scraper'
    );

    const success = scrapingResult?.success || false;
    
    return new Response(
      JSON.stringify({
        success,
        method: scrapingResult?.method || 'unknown',
        articlesFound: scrapingResult?.articlesFound || 0,
        articlesScraped: scrapingResult?.articlesScraped || 0,
        articlesStored: storedCount,
        duplicatesSkipped: duplicateCount,
        filteredForRelevance: discardedCount,
        responseTime,
        cacheUsed: scrapingResult?.cacheUsed || false,
        fallbackUsed: scrapingResult?.fallbackUsed || false,
        sourceHealth: scrapingResult?.sourceHealth || 'unknown',
        errors: scrapingResult?.errors || [],
        message: success 
          ? `Successfully scraped ${storedCount} articles using resilient ${scrapingResult.method}`
          : `Resilient scraping failed: ${scrapingResult?.errors.join(', ') || 'Unknown error'}`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Hybrid scraper error:', error);
    
    // Log error event
    const dbOps = new DatabaseOperations(supabase);
    await dbOps.logSystemEvent(
      'error',
      `Hybrid scraper failed: ${error.message}`,
      { error: error.message, stack: error.stack },
      'hybrid-scraper'
    );

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error',
        message: 'Hybrid scraper encountered an error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});