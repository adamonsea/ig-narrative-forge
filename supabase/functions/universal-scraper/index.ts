import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EnhancedScrapingStrategies } from '../_shared/enhanced-scraping-strategies.ts';
import { DatabaseOperations } from '../_shared/database-operations.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    console.log(`🚀 Universal scraper started for source: ${sourceId}, region: ${region}`);
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

    // Initialize enhanced scraping system
    const scrapingStrategies = new EnhancedScrapingStrategies(region, sourceInfo, feedUrl);
    const dbOps = new DatabaseOperations(supabase);

    // Execute enhanced scraping
    console.log(`🔄 Starting enhanced scraping for ${sourceInfo.source_name}`);
    const scrapingResult = await scrapingStrategies.executeScrapingStrategy();

    let storedCount = 0;
    let duplicateCount = 0;
    let discardedCount = 0;

    if (scrapingResult.success && scrapingResult.articles.length > 0) {
      console.log(`✅ Scraping successful: ${scrapingResult.articles.length} articles found`);
      
      // Store articles with enhanced filtering
      const storageResult = await dbOps.storeArticles(
        scrapingResult.articles,
        sourceId,
        region
      );
      
      storedCount = storageResult.stored;
      duplicateCount = storageResult.duplicates;
      discardedCount = storageResult.discarded;

      console.log(`📊 Storage complete: ${storedCount} stored, ${duplicateCount} duplicates, ${discardedCount} discarded`);
    } else {
      console.log(`❌ Scraping failed or no articles found`);
    }

    // Update source metrics
    const responseTime = Date.now() - startTime;
    await dbOps.updateSourceMetrics(
      sourceId,
      scrapingResult.success,
      scrapingResult.method,
      responseTime
    );

    // Log system event
    await dbOps.logSystemEvent(
      scrapingResult.success ? 'info' : 'warn',
      `Universal scraper completed for ${sourceInfo.source_name}`,
      {
        sourceId,
        region,
        method: scrapingResult.method,
        articlesFound: scrapingResult.articlesFound,
        articlesScraped: scrapingResult.articlesScraped,
        stored: storedCount,
        duplicates: duplicateCount,
        discarded: discardedCount,
        responseTime,
        errors: scrapingResult.errors
      },
      'universal-scraper'
    );

    return new Response(
      JSON.stringify({
        success: scrapingResult.success,
        method: scrapingResult.method,
        articlesFound: scrapingResult.articlesFound,
        articlesScraped: scrapingResult.articlesScraped,
        articlesStored: storedCount,
        duplicatesSkipped: duplicateCount,
        filteredForRelevance: discardedCount,
        responseTime,
        errors: scrapingResult.errors,
        message: scrapingResult.success 
          ? `Successfully scraped ${storedCount} articles using ${scrapingResult.method}`
          : `Scraping failed: ${scrapingResult.errors.join(', ')}`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Universal scraper error:', error);
    
    // Log error event
    const dbOps = new DatabaseOperations(supabase);
    await dbOps.logSystemEvent(
      'error',
      `Universal scraper failed: ${error.message}`,
      { error: error.message, stack: error.stack },
      'universal-scraper'
    );

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error',
        message: 'Universal scraper encountered an error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});